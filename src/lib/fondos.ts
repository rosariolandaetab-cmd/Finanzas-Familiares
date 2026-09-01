import { supabase } from "@/lib/supabase/client";
import { sumarMesesAPeriodo } from "@/lib/formato";
import type { MovimientoFondoInsert, VFondoSaldo } from "@/types/database";

const CODIGO_RETIRO_FONDO = "TR-06";

const NOMBRE_FONDO_POR_CODIGO: Record<string, string> = {
  "FO-01": "Vacaciones",
  "FO-02": "Casa y equipamiento",
  "FO-03": "Fondo de reserva",
};

export function esCodigoAporteFondo(codigo: string | undefined | null): boolean {
  return !!codigo && codigo in NOMBRE_FONDO_POR_CODIGO;
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

// Registra el aporte a un fondo especifico, a partir de un movimiento de
// Transferencia ya guardado (categoria = Vacaciones / Casa y equipamiento /
// Fondo de reserva).
export async function registrarAporteFondo({
  movimientoId,
  codigoCategoria,
  monto,
  fecha,
  creadoPor,
}: {
  movimientoId: string;
  codigoCategoria: string;
  monto: number;
  fecha: string;
  creadoPor: number | null;
}) {
  const nombreFondo = NOMBRE_FONDO_POR_CODIGO[codigoCategoria];
  if (!nombreFondo) return;
  const { data: fondo } = await supabase.from("fondos").select("id").eq("nombre", nombreFondo).maybeSingle();
  if (!fondo) return;

  const fila: MovimientoFondoInsert = {
    fecha,
    tipo: "APORTE",
    fondo_id: fondo.id,
    monto,
    movimiento_id: movimientoId,
    comentario: null,
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

export async function aportesFondosPeriodo(periodo: string): Promise<number> {
  const { data } = await supabase
    .from("fondos_movimientos")
    .select("monto")
    .eq("tipo", "APORTE")
    .gte("fecha", `${periodo}-01`)
    .lt("fecha", `${sumarMesesAPeriodo(periodo, 1)}-01`);
  return (data ?? []).reduce((a, m) => a + m.monto, 0);
}
