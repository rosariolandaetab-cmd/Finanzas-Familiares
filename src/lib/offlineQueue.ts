import { supabase } from "@/lib/supabase/client";
import type { MovimientoInsert } from "@/types/database";

const KEY = "movimientos_pendientes_sync";

function leerCola(): MovimientoInsert[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as MovimientoInsert[]) : [];
  } catch {
    return [];
  }
}

function guardarCola(cola: MovimientoInsert[]) {
  window.localStorage.setItem(KEY, JSON.stringify(cola));
}

export function encolarMovimiento(mov: MovimientoInsert) {
  const cola = leerCola();
  cola.push(mov);
  guardarCola(cola);
}

export function cantidadPendiente(): number {
  return leerCola().length;
}

export async function sincronizarPendientes(): Promise<{ enviados: number; quedan: number }> {
  const cola = leerCola();
  if (cola.length === 0) return { enviados: 0, quedan: 0 };

  const restantes: MovimientoInsert[] = [];
  let enviados = 0;

  for (const mov of cola) {
    const { error } = await supabase.from("movimientos").insert(mov);
    if (error) {
      restantes.push(mov);
    } else {
      enviados++;
    }
  }

  guardarCola(restantes);
  return { enviados, quedan: restantes.length };
}
