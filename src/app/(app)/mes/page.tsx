"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { formatoPesos, periodoActual } from "@/lib/formato";
import { CLASES_SEMAFORO, colorSemaforo } from "@/lib/semaforo";
import { SelectorPeriodo } from "@/components/SelectorPeriodo";
import { WaterfallChart } from "@/components/WaterfallChart";
import type { Cuenta, VDeudaTarjeta, VPresupuestoMes, VResumenMensual } from "@/types/database";

function proximoVencimiento(diaVencimiento: number | null): string | null {
  if (!diaVencimiento) return null;
  const hoy = new Date();
  let candidato = new Date(hoy.getFullYear(), hoy.getMonth(), diaVencimiento);
  if (candidato < hoy) {
    candidato = new Date(hoy.getFullYear(), hoy.getMonth() + 1, diaVencimiento);
  }
  return candidato.toLocaleDateString("es-CL", { day: "numeric", month: "long" });
}

export default function MesPage() {
  const [periodo, setPeriodo] = useState(periodoActual());
  const [cargando, setCargando] = useState(true);
  const [resumen, setResumen] = useState<VResumenMensual | null>(null);
  const [gastoRecurrente, setGastoRecurrente] = useState(0);
  const [presupuestoMes, setPresupuestoMes] = useState<VPresupuestoMes[]>([]);
  const [deudas, setDeudas] = useState<VDeudaTarjeta[]>([]);
  const [tarjetas, setTarjetas] = useState<Cuenta[]>([]);

  useEffect(() => {
    let cancelado = false;
    async function cargar() {
      setCargando(true);
      const [
        { data: resumenData },
        { data: movsRecurrentes },
        { data: presupuestoData },
        { data: deudaData },
        { data: tarjetasData },
      ] = await Promise.all([
        supabase.from("v_resumen_mensual").select("*").eq("periodo", periodo).maybeSingle(),
        supabase
          .from("v_movimientos")
          .select("monto")
          .eq("periodo_devengado", periodo)
          .eq("tipo_flujo", "GASTO")
          .eq("recurrencia", "RECURRENTE"),
        supabase.from("v_presupuesto_mes").select("*").eq("periodo", periodo),
        supabase.from("v_deuda_tarjeta").select("*"),
        supabase.from("cuentas").select("*").eq("tipo", "TARJETA_CREDITO").eq("activa", true),
      ]);
      if (cancelado) return;
      setResumen(resumenData ?? null);
      setGastoRecurrente((movsRecurrentes ?? []).reduce((acc, m) => acc + m.monto, 0));
      setPresupuestoMes(presupuestoData ?? []);
      setDeudas(deudaData ?? []);
      setTarjetas(tarjetasData ?? []);
      setCargando(false);
    }
    cargar();
    return () => {
      cancelado = true;
    };
  }, [periodo]);

  const indicadores = useMemo(() => {
    const r = resumen ?? {
      ingreso_recurrente: 0,
      ingreso_extraordinario: 0,
      fijos: 0,
      deudas: 0,
      asignacion_personal: 0,
      variables: 0,
      fondos: 0,
      gasto_total: 0,
    };
    const ingresoTotal = r.ingreso_recurrente + r.ingreso_extraordinario;
    const resultado = ingresoTotal - r.gasto_total;
    const tasaAhorroRecurrente =
      r.ingreso_recurrente > 0 ? (r.ingreso_recurrente - gastoRecurrente) / r.ingreso_recurrente : 0;
    const fijosDeudasSobreIngreso =
      r.ingreso_recurrente > 0 ? (r.fijos + r.deudas) / r.ingreso_recurrente : 0;
    return { ...r, resultado, tasaAhorroRecurrente, fijosDeudasSobreIngreso };
  }, [resumen, gastoRecurrente]);

  const pasosCascada = useMemo(
    () => [
      { nombre: "Ingreso recurrente", delta: indicadores.ingreso_recurrente, tipo: "ingreso" as const },
      { nombre: "Extraordinario", delta: indicadores.ingreso_extraordinario, tipo: "ingreso" as const },
      { nombre: "Fijos", delta: -indicadores.fijos, tipo: "salida" as const },
      { nombre: "Deudas", delta: -indicadores.deudas, tipo: "salida" as const },
      { nombre: "Asignacion personal", delta: -indicadores.asignacion_personal, tipo: "salida" as const },
      { nombre: "Variables", delta: -indicadores.variables, tipo: "salida" as const },
      { nombre: "Fondos", delta: -indicadores.fondos, tipo: "salida" as const },
      { nombre: "Resultado", delta: indicadores.resultado, tipo: "resultado" as const },
    ],
    [indicadores]
  );

  const categoriasOrdenadas = useMemo(
    () =>
      [...presupuestoMes].sort((a, b) => {
        const pctA = a.tope > 0 ? a.gastado / a.tope : a.gastado > 0 ? Infinity : 0;
        const pctB = b.tope > 0 ? b.gastado / b.tope : b.gastado > 0 ? Infinity : 0;
        return pctB - pctA;
      }),
    [presupuestoMes]
  );

  if (cargando) {
    return <div className="flex min-h-[60dvh] items-center justify-center text-slate-400">Cargando...</div>;
  }

  return (
    <div className="mx-auto max-w-md space-y-6 p-4">
      <SelectorPeriodo periodo={periodo} onChange={setPeriodo} />

      {deudas.length > 0 && (
        <div className="rounded-2xl bg-slate-900 p-4 text-white">
          <p className="text-xs uppercase tracking-wide text-slate-300">Deuda de tarjeta hoy</p>
          <div className="mt-2 space-y-2">
            {deudas.map((d) => {
              const cuenta = tarjetas.find((t) => t.nombre === d.tarjeta);
              const vence = proximoVencimiento(cuenta?.dia_vencimiento ?? null);
              return (
                <div key={d.tarjeta} className="flex items-center justify-between">
                  <span className="text-sm">{d.tarjeta}</span>
                  <div className="text-right">
                    <div className="text-lg font-semibold">{formatoPesos(d.total_pendiente)}</div>
                    {vence && <div className="text-[11px] text-slate-400">vence el {vence}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Indicador etiqueta="Ingreso recurrente" valor={formatoPesos(indicadores.ingreso_recurrente)} />
        <Indicador etiqueta="Ingreso extraordinario" valor={formatoPesos(indicadores.ingreso_extraordinario)} />
        <Indicador etiqueta="Gasto total" valor={formatoPesos(indicadores.gasto_total)} />
        <Indicador
          etiqueta="Resultado del mes"
          valor={formatoPesos(indicadores.resultado)}
          negativo={indicadores.resultado < 0}
        />
        <Indicador
          etiqueta="Tasa de ahorro recurrente"
          valor={`${Math.round(indicadores.tasaAhorroRecurrente * 100)}%`}
          negativo={indicadores.tasaAhorroRecurrente < 0}
        />
        <Indicador
          etiqueta="Fijos + deudas / ingreso"
          valor={`${Math.round(indicadores.fijosDeudasSobreIngreso * 100)}%`}
        />
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium text-slate-500">Flujo del mes</h2>
        <div className="rounded-2xl bg-white p-2 ring-1 ring-slate-200">
          <WaterfallChart pasos={pasosCascada} />
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium text-slate-500">Categorias vs presupuesto</h2>
        {categoriasOrdenadas.length === 0 ? (
          <p className="text-sm text-slate-400">
            Todavia no hay presupuesto definido para este mes. Configuralo en la pestana Presupuesto.
          </p>
        ) : (
          <div className="space-y-2">
            {categoriasOrdenadas.map((c) => {
              const color = colorSemaforo(c.gastado, c.tope);
              const pct = c.tope > 0 ? Math.min(100, Math.round((c.gastado / c.tope) * 100)) : 100;
              return (
                <div key={c.categoria} className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-700">{c.categoria}</span>
                    <span className="text-slate-500">
                      {formatoPesos(c.gastado)} / {formatoPesos(c.tope)}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full ${CLASES_SEMAFORO[color]}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Indicador({
  etiqueta,
  valor,
  negativo,
}: {
  etiqueta: string;
  valor: string;
  negativo?: boolean;
}) {
  return (
    <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
      <p className="text-[11px] text-slate-500">{etiqueta}</p>
      <p className={`mt-1 text-lg font-semibold ${negativo ? "text-red-600" : "text-slate-900"}`}>{valor}</p>
    </div>
  );
}
