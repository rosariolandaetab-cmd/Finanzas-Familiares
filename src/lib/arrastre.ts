import { supabase } from "@/lib/supabase/client";
import { sumarMesesAPeriodo } from "@/lib/formato";

// Saldo que pasa de un mes al siguiente.
//
// Saldo final de un mes = saldo del mes anterior + ingresos - gastos
//                         - lo que se guardo en fondos/inversion (neto de retiros de fondos).
// Pago de tarjeta, ajustes, garantias y ganancias de inversion no mueven
// este saldo: son plata que no queda disponible para el mes, o que ya se
// conto como gasto al comprar.
// Un "Retiro de inversion" tampoco: la plata que sale de la inversion no
// entra a la caja. Lo que se usa en el mes se anota aparte como ingreso.
//
// La cadena parte en el mes "arrastre_desde" (tabla configuracion) con
// "arrastre_saldo_inicial": antes de ese mes no se arrastra nada, porque el
// historial migrado no parte de un saldo conocido.

const CODIGO_APORTE_INVERSION = "TR-01";
const CODIGO_RETIRO_FONDO = "TR-06";

export type ConfigArrastre = { desde: string; saldoInicial: number };

export async function obtenerConfigArrastre(): Promise<ConfigArrastre | null> {
  const { data, error } = await supabase
    .from("configuracion")
    .select("clave, valor")
    .in("clave", ["arrastre_desde", "arrastre_saldo_inicial"]);
  if (error || !data) return null;
  const desde = data.find((d) => d.clave === "arrastre_desde")?.valor;
  if (!desde) return null;
  const saldoInicial = Number(data.find((d) => d.clave === "arrastre_saldo_inicial")?.valor ?? "0") || 0;
  return { desde, saldoInicial };
}

export async function guardarConfigArrastre(config: ConfigArrastre) {
  await supabase.from("configuracion").upsert([
    { clave: "arrastre_desde", valor: config.desde },
    { clave: "arrastre_saldo_inicial", valor: String(config.saldoInicial) },
  ]);
}

export type FlujoMes = {
  ingresos: number;
  gastos: number;
  ahorroNeto: number; // aportes a fondos/inversion menos retiros
  neto: number; // ingresos - gastos - ahorroNeto
};

async function flujosPorMes(desde: string, hasta: string): Promise<Map<string, FlujoMes>> {
  const [{ data: resumenes }, { data: categoriasTr }, { data: transferencias }] = await Promise.all([
    supabase.from("v_resumen_mensual").select("*").gte("periodo", desde).lte("periodo", hasta),
    supabase.from("categorias").select("id, codigo, grupo").eq("tipo", "TRANSFERENCIA"),
    supabase
      .from("v_movimientos")
      .select("categoria_id, monto, periodo_devengado")
      .eq("tipo_flujo", "TRANSFERENCIA")
      .gte("periodo_devengado", desde)
      .lte("periodo_devengado", hasta),
  ]);

  const signoAhorro = new Map<number, number>();
  for (const c of categoriasTr ?? []) {
    if (c.codigo === CODIGO_APORTE_INVERSION || c.grupo === "Fondos") signoAhorro.set(c.id, 1);
    if (c.codigo === CODIGO_RETIRO_FONDO) signoAhorro.set(c.id, -1);
  }

  const flujos = new Map<string, FlujoMes>();
  for (let p = desde; p <= hasta; p = sumarMesesAPeriodo(p, 1)) {
    const r = (resumenes ?? []).find((x) => x.periodo === p);
    const ingresos = r ? r.ingreso_recurrente + r.ingreso_extraordinario : 0;
    const gastos = r ? r.gasto_total : 0;
    const ahorroNeto = (transferencias ?? [])
      .filter((t) => t.periodo_devengado === p)
      .reduce((a, t) => a + (signoAhorro.get(t.categoria_id) ?? 0) * t.monto, 0);
    flujos.set(p, { ingresos, gastos, ahorroNeto, neto: ingresos - gastos - ahorroNeto });
  }
  return flujos;
}

export type ArrastreMes = {
  saldoAnterior: number; // lo que viene del mes anterior
  flujo: FlujoMes;
  saldoFinal: number; // lo que pasa al mes siguiente
};

// null si el mes es anterior al inicio del arrastre (o si falta correr el SQL 07)
export async function arrastreDelMes(periodo: string, config: ConfigArrastre | null): Promise<ArrastreMes | null> {
  if (!config || periodo < config.desde) return null;
  const flujos = await flujosPorMes(config.desde, periodo);
  let saldo = config.saldoInicial;
  for (let p = config.desde; p < periodo; p = sumarMesesAPeriodo(p, 1)) {
    saldo += flujos.get(p)?.neto ?? 0;
  }
  const flujo = flujos.get(periodo)!;
  return { saldoAnterior: saldo, flujo, saldoFinal: saldo + flujo.neto };
}
