import { supabase } from "@/lib/supabase/client";
import { sumarMesesAPeriodo } from "@/lib/formato";
import type {
  ActivoInversion,
  CuotaInversion,
  MovActivoInversion,
  ParticipanteInversion,
  TipoActivoInversion,
} from "@/types/database";

// Portafolio de inversion (ver 08_portafolio_inversion.sql).
//
// Donde esta la plata: cada activo (fondo, terreno, prestamo...) tiene
// movimientos cuyo monto cambia su valor. Valor del activo = suma de montos.
//
// De quien es: todo el portafolio es una bolsa comun repartida en cuotas.
// Valor cuota = valor total del portafolio / cuotas totales. Al aportar se
// compran cuotas al valor del dia, al retirar se venden. Las ganancias
// (actualizar valor) no cambian las cuotas, solo suben su valor, asi que el
// reparto entre Rocha y Lalo siempre cuadra solo.

const CODIGO_SUELDO_ROCHA = "IN-01";
const CODIGO_SUELDO_LALO = "IN-02";
const VALOR_CUOTA_INICIAL = 1000;

export const TIPOS_ACTIVO: { valor: TipoActivoInversion; etiqueta: string }[] = [
  { valor: "FONDO", etiqueta: "Fondo / fondo mutuo" },
  { valor: "DEPOSITO", etiqueta: "Deposito a plazo" },
  { valor: "ACCIONES", etiqueta: "Acciones / ETF" },
  { valor: "TERRENO", etiqueta: "Terreno" },
  { valor: "PROPIEDAD", etiqueta: "Propiedad" },
  { valor: "PRESTAMO", etiqueta: "Prestamo a terceros" },
  { valor: "OTRO", etiqueta: "Otro" },
];

export type ResumenActivo = ActivoInversion & {
  valor: number;
  capital: number; // lo puesto neto (aportes + traspasos - retiros)
  ganancia: number; // suma de actualizaciones de valor
  retorno: number | null; // ganancia / capital
};

export type ResumenParticipante = ParticipanteInversion & {
  cuotas: number;
  valor: number;
  porcentaje: number;
  aportado: number; // aportes - retiros en pesos
};

export type Portafolio = {
  activos: ResumenActivo[]; // incluye archivados (para el historial)
  movs: MovActivoInversion[];
  cuotas: CuotaInversion[];
  participantes: ResumenParticipante[];
  total: number;
  gananciaTotal: number;
  valorCuota: number;
};

function calcularValorCuota(total: number, cuotasTotales: number) {
  return cuotasTotales > 0 ? total / cuotasTotales : VALOR_CUOTA_INICIAL;
}

export async function obtenerPortafolio(): Promise<Portafolio> {
  const [{ data: activos }, { data: movs }, { data: cuotas }, { data: participantes }] = await Promise.all([
    supabase.from("inversion_activos").select("*").order("id"),
    supabase.from("inversion_activo_movs").select("*").order("fecha", { ascending: false }).order("creado_en", { ascending: false }),
    supabase.from("inversion_cuotas").select("*"),
    supabase.from("inversion_participantes").select("*").eq("activo", true).order("id"),
  ]);

  const listaMovs = movs ?? [];
  const resumenActivos: ResumenActivo[] = (activos ?? []).map((a) => {
    const propios = listaMovs.filter((m) => m.activo_id === a.id);
    const valor = propios.reduce((s, m) => s + m.monto, 0);
    const ganancia = propios.filter((m) => m.tipo === "VALOR").reduce((s, m) => s + m.monto, 0);
    const capital = valor - ganancia;
    return { ...a, valor, capital, ganancia, retorno: capital > 0 ? ganancia / capital : null };
  });

  const total = resumenActivos.reduce((s, a) => s + a.valor, 0);
  const listaCuotas = cuotas ?? [];
  const cuotasTotales = listaCuotas.reduce((s, c) => s + Number(c.cuotas), 0);
  const valorCuota = calcularValorCuota(total, cuotasTotales);

  const resumenParticipantes: ResumenParticipante[] = (participantes ?? []).map((p) => {
    const propias = listaCuotas.filter((c) => c.participante_id === p.id);
    const nCuotas = propias.reduce((s, c) => s + Number(c.cuotas), 0);
    return {
      ...p,
      cuotas: nCuotas,
      valor: Math.round(nCuotas * valorCuota),
      porcentaje: cuotasTotales > 0 ? nCuotas / cuotasTotales : 0,
      aportado: propias.reduce((s, c) => s + c.monto, 0),
    };
  });

  return {
    activos: resumenActivos,
    movs: listaMovs,
    cuotas: listaCuotas,
    participantes: resumenParticipantes,
    total,
    gananciaTotal: resumenActivos.reduce((s, a) => s + a.ganancia, 0),
    valorCuota,
  };
}

async function idCategoria(codigo: string): Promise<number | null> {
  const { data } = await supabase.from("categorias").select("id").eq("codigo", codigo).maybeSingle();
  return data?.id ?? null;
}

// reparte un monto exacto en pesos segun pesos relativos, sin perder pesos por redondeo
function repartir(monto: number, pesos: { id: number; peso: number }[]): { id: number; monto: number }[] {
  const totalPeso = pesos.reduce((s, p) => s + p.peso, 0);
  let asignado = 0;
  return pesos.map((p, i) => {
    const parte = i === pesos.length - 1 ? monto - asignado : Math.round((monto * p.peso) / totalPeso);
    asignado += parte;
    return { id: p.id, monto: parte };
  });
}

// % de Rocha segun los sueldos del mes; 50/50 si no hay sueldos registrados
async function pesosPorSueldo(periodo: string, rochaId: number, laloId: number) {
  const [catRocha, catLalo] = await Promise.all([idCategoria(CODIGO_SUELDO_ROCHA), idCategoria(CODIGO_SUELDO_LALO)]);
  if (catRocha && catLalo) {
    const { data: movs } = await supabase
      .from("v_movimientos")
      .select("categoria_id, monto")
      .eq("periodo_devengado", periodo)
      .in("categoria_id", [catRocha, catLalo]);
    const sueldoRocha = (movs ?? []).filter((m) => m.categoria_id === catRocha).reduce((a, m) => a + m.monto, 0);
    const sueldoLalo = (movs ?? []).filter((m) => m.categoria_id === catLalo).reduce((a, m) => a + m.monto, 0);
    if (sueldoRocha + sueldoLalo > 0) {
      return { pesos: [{ id: rochaId, peso: sueldoRocha }, { id: laloId, peso: sueldoLalo }], porSueldo: true };
    }
  }
  return { pesos: [{ id: rochaId, peso: 1 }, { id: laloId, peso: 1 }], porSueldo: false };
}

// Aporte desde Registrar (Transferencia -> Aporte a inversion). El movimiento
// de la cuenta comun ya esta guardado; aqui se suma al activo elegido y se
// compran cuotas: para Rocha y Lalo segun los sueldos del mes, o todo para un
// solo participante si se indica (ej: Bajo Lalo).
export async function registrarAporteInversion({
  movimientoId,
  activoId,
  monto,
  fecha,
  comentario,
  creadoPor,
  participanteId,
}: {
  movimientoId: string;
  activoId: number;
  monto: number;
  fecha: string;
  comentario: string | null;
  creadoPor: number | null;
  participanteId?: number | null;
}): Promise<{ error: string | null }> {
  const portafolio = await obtenerPortafolio();
  const rocha = portafolio.participantes.find((p) => p.nombre === "Rocha");
  const lalo = portafolio.participantes.find((p) => p.nombre === "Lalo");
  if (!rocha || !lalo) return { error: "No encontre a Rocha y Lalo en la inversion." };

  const { pesos, porSueldo } = participanteId
    ? { pesos: [{ id: participanteId, peso: 1 }], porSueldo: true }
    : await pesosPorSueldo(fecha.slice(0, 7), rocha.id, lalo.id);
  const operacionId = crypto.randomUUID();
  const nota = [comentario, porSueldo ? null : "Reparto 50/50 (sin sueldos registrados ese mes)"].filter(Boolean).join(" · ") || null;

  const { error } = await supabase.from("inversion_activo_movs").insert({
    operacion_id: operacionId,
    fecha,
    activo_id: activoId,
    tipo: "APORTE",
    monto,
    movimiento_id: movimientoId,
    comentario: nota,
    creado_por: creadoPor,
  });
  if (error) return { error: "No se pudo registrar el aporte en la inversion." };

  await supabase.from("inversion_cuotas").insert(
    repartir(monto, pesos).map((r) => ({
      operacion_id: operacionId,
      fecha,
      participante_id: r.id,
      cuotas: r.monto / portafolio.valorCuota,
      valor_cuota: portafolio.valorCuota,
      monto: r.monto,
    }))
  );
  return { error: null };
}

// Retiro: la plata sale del portafolio (baja el valor del activo y se venden
// cuotas de quienes retiran, segun su % entre ellos). NO entra a la cuenta
// comun: si esa plata se usa en la caja del mes, se anota aparte como ingreso
// en Registrar. Para mover plata a otra inversion se usa Traspasar.
export async function registrarRetiroInversion({
  activoId,
  monto,
  fecha,
  comentario,
  creadoPor,
  participantesIds,
}: {
  activoId: number;
  monto: number;
  fecha: string;
  comentario: string | null;
  creadoPor: number | null;
  participantesIds: number[];
}): Promise<{ error: string | null }> {
  const portafolio = await obtenerPortafolio();
  const activo = portafolio.activos.find((a) => a.id === activoId);
  if (!activo) return { error: "No encontre ese activo." };
  if (monto > activo.valor) return { error: `${activo.nombre} tiene solo $${activo.valor.toLocaleString("es-CL")}.` };
  const quienes = portafolio.participantes.filter((p) => participantesIds.includes(p.id) && p.cuotas > 0);
  if (quienes.length === 0) return { error: "Los elegidos no tienen cuotas en la inversion." };
  const disponible = quienes.reduce((s, p) => s + p.valor, 0);
  if (monto > disponible) return { error: `Entre los elegidos tienen solo $${disponible.toLocaleString("es-CL")}.` };

  const operacionId = crypto.randomUUID();
  const reparto = repartir(
    monto,
    quienes.map((p) => ({ id: p.id, peso: p.cuotas }))
  );
  const detalle = reparto
    .map((r) => `${quienes.find((p) => p.id === r.id)?.nombre} $${r.monto.toLocaleString("es-CL")}`)
    .join(", ");
  const { error } = await supabase.from("inversion_activo_movs").insert({
    operacion_id: operacionId,
    fecha,
    activo_id: activoId,
    tipo: "RETIRO",
    monto: -monto,
    comentario: [comentario, detalle].filter(Boolean).join(" · "),
    creado_por: creadoPor,
  });
  if (error) return { error: "No se pudo guardar el retiro." };
  await supabase.from("inversion_cuotas").insert(
    reparto.map((r) => ({
      operacion_id: operacionId,
      fecha,
      participante_id: r.id,
      cuotas: -r.monto / portafolio.valorCuota,
      valor_cuota: portafolio.valorCuota,
      monto: -r.monto,
    }))
  );
  return { error: null };
}

// Mover plata de un activo a otro (ej: del fondo del banco al terreno). No
// cambia el total ni las cuotas.
export async function registrarTraspaso({
  origenId,
  destinoId,
  monto,
  fecha,
  comentario,
  creadoPor,
}: {
  origenId: number;
  destinoId: number;
  monto: number;
  fecha: string;
  comentario: string | null;
  creadoPor: number | null;
}): Promise<{ error: string | null }> {
  if (origenId === destinoId) return { error: "Elige dos activos distintos." };
  const portafolio = await obtenerPortafolio();
  const origen = portafolio.activos.find((a) => a.id === origenId);
  if (!origen) return { error: "No encontre el activo de origen." };
  if (monto > origen.valor) return { error: `${origen.nombre} tiene solo $${origen.valor.toLocaleString("es-CL")}.` };

  const operacionId = crypto.randomUUID();
  const { error } = await supabase.from("inversion_activo_movs").insert([
    { operacion_id: operacionId, fecha, activo_id: origenId, tipo: "TRASPASO", monto: -monto, comentario, creado_por: creadoPor },
    { operacion_id: operacionId, fecha, activo_id: destinoId, tipo: "TRASPASO", monto, comentario, creado_por: creadoPor },
  ]);
  return { error: error ? "No se pudo guardar el traspaso." : null };
}

// Registra cuanto vale hoy un activo (segun cartola o tasacion). La diferencia
// con el valor anterior es la ganancia (o perdida).
export async function actualizarValorActivo({
  activoId,
  valorNuevo,
  fecha,
  comentario,
  creadoPor,
}: {
  activoId: number;
  valorNuevo: number;
  fecha: string;
  comentario: string | null;
  creadoPor: number | null;
}): Promise<{ error: string | null; diferencia: number }> {
  const portafolio = await obtenerPortafolio();
  const activo = portafolio.activos.find((a) => a.id === activoId);
  if (!activo) return { error: "No encontre ese activo.", diferencia: 0 };
  const diferencia = valorNuevo - activo.valor;
  if (diferencia === 0) return { error: "El valor es el mismo que ya estaba registrado.", diferencia };

  const { error } = await supabase.from("inversion_activo_movs").insert({
    operacion_id: crypto.randomUUID(),
    fecha,
    activo_id: activoId,
    tipo: "VALOR",
    monto: diferencia,
    comentario,
    creado_por: creadoPor,
  });
  return { error: error ? "No se pudo actualizar el valor." : null, diferencia };
}

export async function crearActivo(nombre: string, tipo: TipoActivoInversion, comentario: string | null) {
  const { error } = await supabase.from("inversion_activos").insert({ nombre, tipo, comentario, activo: true });
  return { error: error ? "No se pudo crear el activo." : null };
}

export async function archivarActivo(activo: ResumenActivo): Promise<{ error: string | null }> {
  if (activo.valor !== 0) {
    return { error: "Este activo todavia tiene valor. Retira o traspasa la plata antes de eliminarlo." };
  }
  await supabase.from("inversion_activos").update({ activo: false }).eq("id", activo.id);
  return { error: null };
}

// Plata que ya estaba invertida en otro lado y se suma al portafolio (no sale
// de la caja). Cada uno compra cuotas por el monto que se le asigna.
export async function agregarSaldoExistente({
  activoId,
  fecha,
  comentario,
  creadoPor,
  asignaciones,
}: {
  activoId: number;
  fecha: string;
  comentario: string | null;
  creadoPor: number | null;
  asignaciones: { participanteId: number; monto: number }[];
}): Promise<{ error: string | null }> {
  const validas = asignaciones.filter((a) => a.monto > 0);
  const total = validas.reduce((s, a) => s + a.monto, 0);
  if (total <= 0) return { error: "Asigna el monto a al menos una persona." };

  const portafolio = await obtenerPortafolio();
  const detalle = validas
    .map((a) => `${portafolio.participantes.find((p) => p.id === a.participanteId)?.nombre} $${a.monto.toLocaleString("es-CL")}`)
    .join(", ");
  const operacionId = crypto.randomUUID();
  const { error } = await supabase.from("inversion_activo_movs").insert({
    operacion_id: operacionId,
    fecha,
    activo_id: activoId,
    tipo: "SALDO_INICIAL",
    monto: total,
    comentario: [comentario, detalle].filter(Boolean).join(" · "),
    creado_por: creadoPor,
  });
  if (error) return { error: "No se pudo agregar el saldo." };
  await supabase.from("inversion_cuotas").insert(
    validas.map((a) => ({
      operacion_id: operacionId,
      fecha,
      participante_id: a.participanteId,
      cuotas: a.monto / portafolio.valorCuota,
      valor_cuota: portafolio.valorCuota,
      monto: a.monto,
    }))
  );
  return { error: null };
}

// Vuelve a calcular las cuotas de todas las operaciones en el orden en que se
// ingresaron (igual que cuando se registraron): cada una compra o vende al
// valor cuota que habia justo antes. Los pesos de cada persona no cambian,
// solo sus cuotas. Se usa al borrar una operacion en medio del historial.
export async function recalcularCuotas() {
  const [{ data: movs }, { data: cuotas }] = await Promise.all([
    supabase.from("inversion_activo_movs").select("operacion_id, monto, creado_en"),
    supabase.from("inversion_cuotas").select("*"),
  ]);
  const ops = new Map<string, { creadoEn: string; monto: number }>();
  for (const m of movs ?? []) {
    const op = ops.get(m.operacion_id);
    if (!op) ops.set(m.operacion_id, { creadoEn: m.creado_en, monto: m.monto });
    else {
      op.monto += m.monto;
      if (m.creado_en < op.creadoEn) op.creadoEn = m.creado_en;
    }
  }
  const orden = Array.from(ops.entries()).sort(([, a], [, b]) => a.creadoEn.localeCompare(b.creadoEn));

  let total = 0;
  let cuotasTotales = 0;
  const cambios: { id: string; cuotas: number; valor_cuota: number }[] = [];
  for (const [id, op] of orden) {
    const valorCuota = calcularValorCuota(total, cuotasTotales);
    for (const c of (cuotas ?? []).filter((x) => x.operacion_id === id)) {
      const nuevas = c.monto / valorCuota;
      if (Math.abs(nuevas - Number(c.cuotas)) > 1e-6) cambios.push({ id: c.id, cuotas: nuevas, valor_cuota: valorCuota });
      cuotasTotales += nuevas;
    }
    total += op.monto;
  }
  await Promise.all(
    cambios.map((c) => supabase.from("inversion_cuotas").update({ cuotas: c.cuotas, valor_cuota: c.valor_cuota }).eq("id", c.id))
  );
}

// Borra una operacion (y, si fue un aporte desde Registrar, su movimiento en
// la cuenta comun) y recalcula las cuotas de las operaciones siguientes.
export async function eliminarOperacion(operacionId: string): Promise<{ error: string | null }> {
  const { data: filas } = await supabase.from("inversion_activo_movs").select("movimiento_id").eq("operacion_id", operacionId);
  await supabase.from("inversion_cuotas").delete().eq("operacion_id", operacionId);
  await supabase.from("inversion_activo_movs").delete().eq("operacion_id", operacionId);
  const idsMov = (filas ?? []).map((f) => f.movimiento_id).filter((id): id is string => !!id);
  if (idsMov.length > 0) await supabase.from("movimientos").delete().in("id", idsMov);
  await recalcularCuotas();
  return { error: null };
}

export async function aportesInversionPeriodo(periodo: string): Promise<number> {
  const { data } = await supabase
    .from("inversion_activo_movs")
    .select("monto")
    .eq("tipo", "APORTE")
    .gte("fecha", `${periodo}-01`)
    .lt("fecha", `${sumarMesesAPeriodo(periodo, 1)}-01`);
  return (data ?? []).reduce((a, m) => a + m.monto, 0);
}
