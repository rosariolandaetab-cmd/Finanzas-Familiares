import { supabase } from "@/lib/supabase/client";
import type { MovimientoInversionInsert, TipoMovInversion, VInversionSaldo } from "@/types/database";

const CODIGO_SUELDO_ROCHA = "IN-01";
const CODIGO_SUELDO_LALO = "IN-02";
const CODIGO_GANANCIA_INVERSION = "IN-04";
const CODIGO_RETIRO_INVERSION = "TR-02";

async function idCategoria(codigo: string): Promise<number | null> {
  const { data } = await supabase.from("categorias").select("id").eq("codigo", codigo).maybeSingle();
  return data?.id ?? null;
}

async function idCuentaPorTipo(tipo: "CORRIENTE" | "INVERSION"): Promise<number | null> {
  const { data } = await supabase.from("cuentas").select("id").eq("tipo", tipo).eq("activa", true).limit(1).maybeSingle();
  return data?.id ?? null;
}

async function participantePorNombre(nombre: string): Promise<number | null> {
  const { data } = await supabase
    .from("inversion_participantes")
    .select("id")
    .eq("nombre", nombre)
    .eq("activo", true)
    .maybeSingle();
  return data?.id ?? null;
}

export async function obtenerSaldos(): Promise<VInversionSaldo[]> {
  const { data } = await supabase.from("v_inversion_saldos").select("*").order("id");
  return data ?? [];
}

function repartirMontoExacto(total: number, pctPrimero: number): [number, number] {
  const primero = Math.round(total * pctPrimero);
  return [primero, total - primero];
}

// Reparte un "Aporte a inversion" ya registrado en movimientos, segun el sueldo
// de cada uno ese mes. Si no hay sueldos registrados ese mes, reparte 50/50.
export async function repartirAporteInversion({
  movimientoId,
  periodo,
  monto,
  fecha,
  creadoPor,
}: {
  movimientoId: string;
  periodo: string;
  monto: number;
  fecha: string;
  creadoPor: number | null;
}) {
  const [catSueldoRocha, catSueldoLalo, rochaId, laloId] = await Promise.all([
    idCategoria(CODIGO_SUELDO_ROCHA),
    idCategoria(CODIGO_SUELDO_LALO),
    participantePorNombre("Rocha"),
    participantePorNombre("Lalo"),
  ]);
  if (!rochaId || !laloId) return;

  let pctRocha = 0.5;
  let sinSueldosRegistrados = true;
  if (catSueldoRocha && catSueldoLalo) {
    const { data: movs } = await supabase
      .from("v_movimientos")
      .select("categoria_id, monto")
      .eq("periodo_devengado", periodo)
      .in("categoria_id", [catSueldoRocha, catSueldoLalo]);
    const sueldoRocha = (movs ?? []).filter((m) => m.categoria_id === catSueldoRocha).reduce((a, m) => a + m.monto, 0);
    const sueldoLalo = (movs ?? []).filter((m) => m.categoria_id === catSueldoLalo).reduce((a, m) => a + m.monto, 0);
    const total = sueldoRocha + sueldoLalo;
    if (total > 0) {
      pctRocha = sueldoRocha / total;
      sinSueldosRegistrados = false;
    }
  }

  const [montoRocha, montoLalo] = repartirMontoExacto(monto, pctRocha);
  const comentario = sinSueldosRegistrados ? "Reparto 50/50 (sin sueldos registrados ese mes)" : null;

  const filas: MovimientoInversionInsert[] = [
    {
      fecha,
      tipo: "APORTE",
      participante_id: rochaId,
      monto: montoRocha,
      porcentaje_aplicado: pctRocha,
      movimiento_id: movimientoId,
      comentario,
      creado_por: creadoPor,
    },
    {
      fecha,
      tipo: "APORTE",
      participante_id: laloId,
      monto: montoLalo,
      porcentaje_aplicado: 1 - pctRocha,
      movimiento_id: movimientoId,
      comentario,
      creado_por: creadoPor,
    },
  ];

  await supabase.from("inversion_movimientos").insert(filas);
}

// Reparte una ganancia entre los 3 participantes activos, segun cuanto tiene
// cada uno hoy. Tambien crea el ingreso correspondiente en movimientos
// (categoria "Utilidad inversiones", extraordinario, cuenta Inversion).
export async function registrarGanancia({
  monto,
  fecha,
  comentario,
  creadoPor,
}: {
  monto: number;
  fecha: string;
  comentario: string | null;
  creadoPor: number | null;
}): Promise<{ error: string | null }> {
  const [saldos, categoriaId, cuentaId] = await Promise.all([
    obtenerSaldos(),
    idCategoria(CODIGO_GANANCIA_INVERSION),
    idCuentaPorTipo("INVERSION"),
  ]);
  if (!categoriaId || !cuentaId) return { error: "Falta configuracion en Supabase (categoria o cuenta de inversion)." };

  const totalSaldo = saldos.reduce((a, s) => a + Math.max(0, s.saldo_actual), 0);
  if (totalSaldo <= 0) return { error: "No hay saldo registrado todavia. Carga primero el saldo inicial de cada uno." };

  const { data: movimiento, error: errorMov } = await supabase
    .from("movimientos")
    .insert({
      fecha_compra: fecha,
      fecha_caja: fecha,
      categoria_id: categoriaId,
      monto,
      cuenta_id: cuentaId,
      estado: "PAGADO",
      comentario,
      origen: "MANUAL",
      creado_por: creadoPor,
    })
    .select("id")
    .single();
  if (errorMov || !movimiento) return { error: "No se pudo guardar la ganancia." };

  await supabase.from("movimientos").update({ recurrencia: "EXTRAORDINARIO" }).eq("id", movimiento.id);

  const filas: MovimientoInversionInsert[] = saldos.map((s) => {
    const pct = Math.max(0, s.saldo_actual) / totalSaldo;
    return {
      fecha,
      tipo: "GANANCIA" as TipoMovInversion,
      participante_id: s.id,
      monto: Math.round(monto * pct),
      porcentaje_aplicado: pct,
      movimiento_id: movimiento.id,
      comentario,
      creado_por: creadoPor,
    };
  });

  await supabase.from("inversion_movimientos").insert(filas);
  return { error: null };
}

// Retira solo entre Rocha y Lalo, segun el % que tiene cada uno del total
// de esos dos (Bajo Lalo no retira todavia).
export async function registrarRetiro({
  monto,
  fecha,
  comentario,
  creadoPor,
}: {
  monto: number;
  fecha: string;
  comentario: string | null;
  creadoPor: number | null;
}): Promise<{ error: string | null }> {
  const [saldos, categoriaId, cuentaId] = await Promise.all([
    obtenerSaldos(),
    idCategoria(CODIGO_RETIRO_INVERSION),
    idCuentaPorTipo("CORRIENTE"),
  ]);
  if (!categoriaId || !cuentaId) return { error: "Falta configuracion en Supabase (categoria o cuenta corriente)." };

  const rocha = saldos.find((s) => s.nombre === "Rocha");
  const lalo = saldos.find((s) => s.nombre === "Lalo");
  if (!rocha || !lalo) return { error: "No encontre a Rocha y Lalo entre los participantes." };

  const totalRochaLalo = Math.max(0, rocha.saldo_actual) + Math.max(0, lalo.saldo_actual);
  if (totalRochaLalo <= 0) return { error: "Rocha y Lalo no tienen saldo para retirar." };
  if (monto > totalRochaLalo) return { error: "El monto a retirar es mayor al saldo disponible entre Rocha y Lalo." };

  const pctRocha = Math.max(0, rocha.saldo_actual) / totalRochaLalo;

  const { data: movimiento, error: errorMov } = await supabase
    .from("movimientos")
    .insert({
      fecha_compra: fecha,
      fecha_caja: fecha,
      categoria_id: categoriaId,
      monto,
      cuenta_id: cuentaId,
      estado: "PAGADO",
      comentario,
      origen: "MANUAL",
      creado_por: creadoPor,
    })
    .select("id")
    .single();
  if (errorMov || !movimiento) return { error: "No se pudo guardar el retiro." };

  await supabase.from("movimientos").update({ recurrencia: "TRANSFERENCIA" }).eq("id", movimiento.id);

  const [montoRocha, montoLalo] = repartirMontoExacto(monto, pctRocha);

  const filas: MovimientoInversionInsert[] = [
    {
      fecha,
      tipo: "RETIRO",
      participante_id: rocha.id,
      monto: -montoRocha,
      porcentaje_aplicado: pctRocha,
      movimiento_id: movimiento.id,
      comentario,
      creado_por: creadoPor,
    },
    {
      fecha,
      tipo: "RETIRO",
      participante_id: lalo.id,
      monto: -montoLalo,
      porcentaje_aplicado: 1 - pctRocha,
      movimiento_id: movimiento.id,
      comentario,
      creado_por: creadoPor,
    },
  ];

  await supabase.from("inversion_movimientos").insert(filas);
  return { error: null };
}

export async function actualizarSaldoInicial(participanteId: number, saldoInicial: number) {
  await supabase.from("inversion_participantes").update({ saldo_inicial: saldoInicial }).eq("id", participanteId);
}
