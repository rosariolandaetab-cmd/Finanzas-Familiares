import { supabase } from "@/lib/supabase/client";
import { sumarMesesAPeriodo } from "@/lib/formato";
import type { MovimientoFondoInsert, VFondoSaldo } from "@/types/database";

const CODIGO_RETIRO_FONDO = "TR-06";

// Cada fondo tiene su propia categoria de Transferencia (fondos.categoria_id):
// al elegirla en Registrar se registra el aporte a ese fondo.
export async function fondoDeCategoria(categoriaId: number): Promise<number | null> {
  const { data } = await supabase
    .from("fondos")
    .select("id")
    .eq("categoria_id", categoriaId)
    .eq("activo", true)
    .maybeSingle();
  return data?.id ?? null;
}

async function idCategoria(codigo: string): Promise<number | null> {
  const { data } = await supabase.from("categorias").select("id").eq("codigo", codigo).maybeSingle();
  return data?.id ?? null;
}

async function idCuentaPorTipo(tipo: "CORRIENTE"): Promise<number | null> {
  const { data } = await supabase.from("cuentas").select("id").eq("tipo", tipo).eq("activa", true).limit(1).maybeSingle();
  return data?.id ?? null;
}

export async function obtenerSaldosFondos(): Promise<VFondoSaldo[]> {
  const { data } = await supabase.from("v_fondos_saldos").select("*").order("id");
  return data ?? [];
}

// Registra el aporte a un fondo, a partir de un movimiento de Transferencia
// ya guardado con la categoria de ese fondo.
export async function registrarAporteFondo({
  movimientoId,
  fondoId,
  monto,
  fecha,
  comentario,
  creadoPor,
}: {
  movimientoId: string;
  fondoId: number;
  monto: number;
  fecha: string;
  comentario: string | null;
  creadoPor: number | null;
}) {
  const fila: MovimientoFondoInsert = {
    fecha,
    tipo: "APORTE",
    fondo_id: fondoId,
    monto,
    movimiento_id: movimientoId,
    comentario,
    creado_por: creadoPor,
  };
  await supabase.from("fondos_movimientos").insert(fila);
}

export async function registrarRetiroFondo({
  fondoId,
  monto,
  fecha,
  comentario,
  creadoPor,
}: {
  fondoId: number;
  monto: number;
  fecha: string;
  comentario: string | null;
  creadoPor: number | null;
}): Promise<{ error: string | null }> {
  const [categoriaId, cuentaId] = await Promise.all([idCategoria(CODIGO_RETIRO_FONDO), idCuentaPorTipo("CORRIENTE")]);
  if (!categoriaId || !cuentaId) return { error: "Falta configuracion en Supabase (categoria o cuenta corriente)." };

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

  const fila: MovimientoFondoInsert = {
    fecha,
    tipo: "RETIRO",
    fondo_id: fondoId,
    monto,
    movimiento_id: movimiento.id,
    comentario,
    creado_por: creadoPor,
  };
  await supabase.from("fondos_movimientos").insert(fila);
  return { error: null };
}

export async function actualizarSaldoInicialFondo(fondoId: number, saldoInicial: number) {
  await supabase.from("fondos").update({ saldo_inicial: saldoInicial }).eq("id", fondoId);
}

// Crea el fondo y su categoria de Transferencia (grupo "Fondos"), para que
// aparezca en Registrar como destino de aportes.
export async function crearFondo(nombre: string): Promise<{ error: string | null }> {
  const { data: codigos } = await supabase.from("categorias").select("codigo, orden").like("codigo", "FO-%");
  const siguiente =
    Math.max(0, ...(codigos ?? []).map((c) => Number(c.codigo.slice(3)) || 0)) + 1;
  const orden = Math.max(0, ...(codigos ?? []).map((c) => c.orden)) + 1;

  const { data: categoria, error: errorCat } = await supabase
    .from("categorias")
    .insert({
      codigo: `FO-${String(siguiente).padStart(2, "0")}`,
      tipo: "TRANSFERENCIA",
      grupo: "Fondos",
      nombre,
      orden,
      activa: true,
      presupuestable: false,
    })
    .select("id")
    .single();
  if (errorCat || !categoria) return { error: "No se pudo crear la categoria del fondo." };

  const { error } = await supabase.from("fondos").insert({ nombre, activo: true, saldo_inicial: 0, categoria_id: categoria.id });
  if (error) return { error: "No se pudo crear el fondo." };
  return { error: null };
}

// No se borra: se desactiva el fondo y su categoria, asi el historial queda
// intacto. Solo se permite con saldo en cero.
export async function eliminarFondo(fondo: VFondoSaldo): Promise<{ error: string | null }> {
  if (fondo.saldo_actual !== 0) {
    return { error: "Este fondo todavia tiene saldo. Retiralo o ajusta el saldo antes de eliminarlo." };
  }
  const { data } = await supabase.from("fondos").select("categoria_id").eq("id", fondo.id).maybeSingle();
  await supabase.from("fondos").update({ activo: false }).eq("id", fondo.id);
  if (data?.categoria_id) {
    await supabase.from("categorias").update({ activa: false }).eq("id", data.categoria_id);
  }
  return { error: null };
}

export async function aportesFondosPeriodo(periodo: string): Promise<number> {
  const { data } = await supabase
    .from("fondos_movimientos")
    .select("monto")
    .eq("tipo", "APORTE")
    .gte("fecha", `${periodo}-01`)
    .lt("fecha", `${sumarMesesAPeriodo(periodo, 1)}-01`);
  return (data ?? []).reduce((a, m) => a + m.monto, 0);
}
