import { supabase } from "@/lib/supabase/client";
import type { CategoriaPersonal, CuentaPersonal, EstadoMov } from "@/types/database";

// Cuentas personales (ver 09_cuentas_personales.sql). La seguridad de
// Supabase solo devuelve las filas de quien esta conectado, asi que estas
// consultas no filtran por persona.

export async function cargarCatalogoPersonal(): Promise<{
  cuentas: CuentaPersonal[];
  categorias: CategoriaPersonal[];
}> {
  const [{ data: cuentas }, { data: categorias }] = await Promise.all([
    supabase.from("personal_cuentas").select("*").eq("activa", true).order("orden"),
    supabase.from("personal_categorias").select("*").order("orden"),
  ]);
  return { cuentas: cuentas ?? [], categorias: categorias ?? [] };
}

// true si la persona conectada tiene cuentas personales (para mostrar la seccion en el menu)
export async function tieneCuentasPersonales(): Promise<boolean> {
  const { count, error } = await supabase.from("personal_cuentas").select("id", { count: "exact", head: true });
  return !error && (count ?? 0) > 0;
}

export function etiquetaCuentaPersonal(c: CuentaPersonal) {
  return c.tipo === "CREDITO" && c.ultimos4 ? `${c.nombre} •${c.ultimos4}` : c.nombre;
}

export function proximoVencimiento(diaVencimiento: number | null): string | null {
  if (!diaVencimiento) return null;
  const hoy = new Date();
  let candidato = new Date(hoy.getFullYear(), hoy.getMonth(), diaVencimiento);
  if (candidato < hoy) candidato = new Date(hoy.getFullYear(), hoy.getMonth() + 1, diaVencimiento);
  return candidato.toLocaleDateString("es-CL", { day: "numeric", month: "long" });
}

// Pasa un movimiento que se anoto por error en la cuenta familiar a las
// cuentas personales de quien esta conectado: lo crea en personal_movimientos
// y recien entonces lo borra de la cuenta familiar.
export async function moverMovimientoAPersonal({
  movimiento,
  categoriaId,
  cuentaId,
}: {
  movimiento: { id: string; fecha_compra: string; fecha_caja: string | null; monto: number; estado: EstadoMov; comentario: string | null };
  categoriaId: number;
  cuentaId: number | null;
}): Promise<{ error: string | null }> {
  const { error } = await supabase.from("personal_movimientos").insert({
    fecha: movimiento.fecha_compra,
    categoria_id: categoriaId,
    cuenta_id: cuentaId,
    monto: movimiento.monto,
    estado: movimiento.estado,
    fecha_pago: movimiento.estado === "PAGADO" ? movimiento.fecha_caja ?? movimiento.fecha_compra : null,
    comentario: movimiento.comentario,
  });
  if (error) return { error: "No se pudo crear en tus cuentas. No se borro nada de la cuenta familiar." };
  await supabase.from("movimientos").delete().eq("id", movimiento.id);
  return { error: null };
}

const CLAVE_REGISTRAR_PREFERIDO = "registrar_preferido";

// Recuerda en este telefono si la ultima vez se anoto en Familia o en Mis cuentas
export function guardarRegistrarPreferido(valor: "familia" | "personal") {
  try {
    window.localStorage.setItem(CLAVE_REGISTRAR_PREFERIDO, valor);
  } catch {
    // sin almacenamiento local: simplemente no se recuerda
  }
}

export function leerRegistrarPreferido(): "familia" | "personal" {
  try {
    return window.localStorage.getItem(CLAVE_REGISTRAR_PREFERIDO) === "personal" ? "personal" : "familia";
  } catch {
    return "familia";
  }
}
