"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { etiquetaPeriodo, formatoPesos, periodoActual, sumarMesesAPeriodo } from "@/lib/formato";
import { EvolucionChart } from "@/components/EvolucionChart";
import type { VMovimiento, VResumenMensual } from "@/types/database";

const MESES_VENTANA = 6;

function ultimosPeriodos(n: number) {
  const actual = periodoActual();
  const lista: string[] = [];
  for (let i = n - 1; i >= 0; i--) lista.push(sumarMesesAPeriodo(actual, -i));
  return lista;
}

const CATEGORIA_ARRIENDO = "Arriendo Deptos";
const CATEGORIA_CUOTA = "Cuota Deptos";
const CATEGORIA_CONTRIBUCIONES = "Contribuciones deptos";

export default function AnalisisPage() {
  const [cargando, setCargando] = useState(true);
  const [resumenes, setResumenes] = useState<VResumenMensual[]>([]);
  const [movsCategoria, setMovsCategoria] = useState<Pick<VMovimiento, "categoria" | "monto" | "periodo_devengado">[]>(
    []
  );
  const [movsDeptos, setMovsDeptos] = useState<Pick<VMovimiento, "categoria" | "monto">[]>([]);

  useEffect(() => {
    let cancelado = false;
    async function cargar() {
      setCargando(true);
      const periodos = ultimosPeriodos(MESES_VENTANA);
      const [{ data: resumenData }, { data: movsData }, { data: deptosData }] = await Promise.all([
        supabase.from("v_resumen_mensual").select("*").in("periodo", periodos),
        supabase
          .from("v_movimientos")
          .select("categoria, monto, periodo_devengado")
          .eq("tipo_flujo", "GASTO")
          .in("periodo_devengado", periodos),
        supabase
          .from("v_movimientos")
          .select("categoria, monto")
          .in("categoria", [CATEGORIA_ARRIENDO, CATEGORIA_CUOTA, CATEGORIA_CONTRIBUCIONES]),
      ]);
      if (cancelado) return;
      setResumenes(resumenData ?? []);
      setMovsCategoria(movsData ?? []);
      setMovsDeptos(deptosData ?? []);
      setCargando(false);
    }
    cargar();
    return () => {
      cancelado = true;
    };
  }, []);

  const evolucion = useMemo(() => {
    const periodos = ultimosPeriodos(MESES_VENTANA);
    return periodos.map((p) => {
      const r = resumenes.find((x) => x.periodo === p);
      return {
        periodo: p,
        etiqueta: etiquetaPeriodo(p).split(" ")[0].slice(0, 3),
        ingresoRecurrente: r?.ingreso_recurrente ?? 0,
        gastoTotal: r?.gasto_total ?? 0,
      };
    });
  }, [resumenes]);

  const porCategoria = useMemo(() => {
    const periodos = ultimosPeriodos(MESES_VENTANA);
    const ultimos3 = new Set(periodos.slice(3));
    const anteriores3 = new Set(periodos.slice(0, 3));

    const mapa = new Map<string, { total: number; ultimos3: number; anteriores3: number }>();
    for (const m of movsCategoria) {
      const actual = mapa.get(m.categoria) ?? { total: 0, ultimos3: 0, anteriores3: 0 };
      actual.total += m.monto;
      if (ultimos3.has(m.periodo_devengado)) actual.ultimos3 += m.monto;
      if (anteriores3.has(m.periodo_devengado)) actual.anteriores3 += m.monto;
      mapa.set(m.categoria, actual);
    }

    return Array.from(mapa.entries())
      .map(([categoria, v]) => {
        const promedio = v.total / MESES_VENTANA;
        const variacion = v.anteriores3 > 0 ? (v.ultimos3 - v.anteriores3) / v.anteriores3 : v.ultimos3 > 0 ? 1 : 0;
        return { categoria, promedio, ultimos3: v.ultimos3, anteriores3: v.anteriores3, variacion };
      })
      .sort((a, b) => b.promedio - a.promedio);
  }, [movsCategoria]);

  const cajaDeptos = useMemo(() => {
    const suma = (nombre: string) => movsDeptos.filter((m) => m.categoria === nombre).reduce((a, m) => a + m.monto, 0);
    const arriendos = suma(CATEGORIA_ARRIENDO);
    const cuotas = suma(CATEGORIA_CUOTA);
    const contribuciones = suma(CATEGORIA_CONTRIBUCIONES);
    return { arriendos, cuotas, contribuciones, neta: arriendos - cuotas - contribuciones };
  }, [movsDeptos]);

  if (cargando) {
    return <div className="flex min-h-[60dvh] items-center justify-center text-slate-400">Cargando...</div>;
  }

  return (
    <div className="mx-auto max-w-md space-y-6 p-4">
      <div>
        <h2 className="mb-2 text-sm font-medium text-slate-500">Ingreso recurrente vs gasto total</h2>
        <div className="rounded-2xl bg-white p-2 ring-1 ring-slate-200">
          <EvolucionChart datos={evolucion} />
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium text-slate-500">Caja neta de los departamentos</h2>
        <div className="space-y-1 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <Linea etiqueta="Arriendos recibidos" valor={cajaDeptos.arriendos} />
          <Linea etiqueta="Cuotas" valor={-cajaDeptos.cuotas} />
          <Linea etiqueta="Contribuciones" valor={-cajaDeptos.contribuciones} />
          <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
            <span className="text-sm font-medium text-slate-700">Caja neta</span>
            <span className={`text-lg font-semibold ${cajaDeptos.neta < 0 ? "text-red-600" : "text-slate-900"}`}>
              {formatoPesos(cajaDeptos.neta)}
            </span>
          </div>
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium text-slate-500">Por categoria (ultimos {MESES_VENTANA} meses)</h2>
        <div className="space-y-2">
          {porCategoria.map((c) => (
            <div key={c.categoria} className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">{c.categoria}</span>
                <span className="text-sm text-slate-500">promedio {formatoPesos(c.promedio)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
                <span>
                  {formatoPesos(c.anteriores3)} → {formatoPesos(c.ultimos3)}
                </span>
                <span
                  className={`font-medium ${
                    c.variacion > 0.02 ? "text-red-600" : c.variacion < -0.02 ? "text-emerald-600" : "text-slate-400"
                  }`}
                >
                  {c.variacion > 0.02 ? "↑" : c.variacion < -0.02 ? "↓" : "→"} {Math.round(c.variacion * 100)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Linea({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500">{etiqueta}</span>
      <span className="text-slate-700">{formatoPesos(valor)}</span>
    </div>
  );
}
