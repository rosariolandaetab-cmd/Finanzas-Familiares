import { supabase } from "@/lib/supabase/client";
import type { CategoriaPersonal, CuentaPersonal } from "@/types/database";

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
