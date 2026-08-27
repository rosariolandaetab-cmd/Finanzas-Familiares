"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { formatoPesos, periodoActual, sumarMesesAPeriodo } from "@/lib/formato";
import { CLASES_SEMAFORO, colorSemaforo } from "@/lib/semaforo";
import { SelectorPeriodo } from "@/components/SelectorPeriodo";
import type { Categoria, Presupuesto, TipoTope, VPresupuestoMes } from "@/types/database";

type FilaEdicion = { tipo: TipoTope; valorTexto: string };

export default function PresupuestoPage() {
  const [periodo, setPeriodo] = useState(periodoActual());
  const [cargando, setCargando] = useState(true);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([]);
  const [vista, setVista] = useState<VPresupuestoMes[]>([]);
  const [ingresoRecurrente, setIngresoRecurrente] = useState(0);
  const [ediciones, setEdiciones] = useState<Record<number, FilaEdicion>>({});
  const [copiando, setCopiando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    const [{ data: cats }, { data: pres }, { data: vistaData }, { data: resumen }] = await Promise.all([
      supabase.from("categorias").select("*").eq("tipo", "GASTO").eq("activa", true).order("orden"),
      supabase.from("presupuestos").select("*").eq("periodo", periodo),
      supabase.from("v_presupuesto_mes").select("*").eq("periodo", periodo),
      supabase.from("v_resumen_mensual").select("*").eq("periodo", periodo).maybeSingle(),
    ]);
    setCategorias(cats ?? []);
    setPresupuestos(pres ?? []);
    setVista(vistaData ?? []);
    setIngresoRecurrente(resumen?.ingreso_recurrente ?? 0);

    const nuevasEdiciones: Record<number, FilaEdicion> = {};
    for (const c of cats ?? []) {
      const actual = (pres ?? []).find((p) => p.categoria_id === c.id);
      if (actual) {
        nuevasEdiciones[c.id] = {
          tipo: actual.tipo,
          valorTexto: actual.tipo === "FIJO" ? String(Math.round(actual.valor)) : String(actual.valor * 100),
        };
      }
    }
    setEdiciones(nuevasEdiciones);
    setCargando(false);
  }, [periodo]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const vistaPorCategoria = useMemo(() => {
    const mapa = new Map<string, VPresupuestoMes>();
    for (const v of vista) mapa.set(v.categoria, v);
    return mapa;
  }, [vista]);

  const sumaTopes = useMemo(() => vista.reduce((acc, v) => acc + v.tope, 0), [vista]);
  const ahorroProyectado = ingresoRecurrente - sumaTopes;

  async function guardarFila(categoriaId: number, fila: FilaEdicion) {
    const numero = Number(fila.valorTexto || "0");
    if (numero <= 0) return;
    const valor = fila.tipo === "FIJO" ? Math.round(numero) : numero / 100;
    await supabase
      .from("presupuestos")
      .upsert({ periodo, categoria_id: categoriaId, tipo: fila.tipo, valor }, { onConflict: "periodo,categoria_id" });
    cargar();
  }

  async function copiarMesAnterior() {
    setCopiando(true);
    const anterior = sumarMesesAPeriodo(periodo, -1);
    const { data: presAnterior } = await supabase.from("presupuestos").select("*").eq("periodo", anterior);
    if (presAnterior && presAnterior.length > 0) {
      const yaExisten = new Set(presupuestos.map((p) => p.categoria_id));
      const filas = presAnterior
        .filter((p) => !yaExisten.has(p.categoria_id))
        .map((p) => ({ periodo, categoria_id: p.categoria_id, tipo: p.tipo, valor: p.valor }));
      if (filas.length > 0) {
        await supabase.from("presupuestos").insert(filas);
      }
    }
    await cargar();
    setCopiando(false);
  }

  if (cargando) {
    return <div className="flex min-h-[60dvh] items-center justify-center text-slate-400">Cargando...</div>;
  }

  return (
    <div className="mx-auto max-w-md space-y-6 p-4">
      <SelectorPeriodo periodo={periodo} onChange={setPeriodo} />

      <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <p className="text-xs text-slate-500">Ahorro proyectado del mes</p>
        <p className={`mt-1 text-2xl font-semibold ${ahorroProyectado < 0 ? "text-red-600" : "text-slate-900"}`}>
          {formatoPesos(ahorroProyectado)}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Ingreso recurrente ({formatoPesos(ingresoRecurrente)}) menos la suma de topes
        </p>
      </div>

      <button
        type="button"
        onClick={copiarMesAnterior}
        disabled={copiando}
        className="w-full rounded-xl bg-slate-100 py-2.5 text-sm font-medium text-slate-700 disabled:opacity-50"
      >
        {copiando ? "Copiando..." : "Copiar topes del mes anterior"}
      </button>

      <div className="space-y-2">
        {categorias.map((c) => {
          const fila = ediciones[c.id] ?? { tipo: "FIJO" as TipoTope, valorTexto: "" };
          const v = vistaPorCategoria.get(c.nombre);
          const color = v ? colorSemaforo(v.gastado, v.tope) : "verde";
          const pct = v && v.tope > 0 ? Math.min(100, Math.round((v.gastado / v.tope) * 100)) : 0;

          return (
            <div key={c.id} className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">{c.nombre}</span>
                {v && (
                  <span className="text-xs text-slate-500">
                    {formatoPesos(v.gastado)} / {formatoPesos(v.tope)}
                  </span>
                )}
              </div>

              {v && (
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full ${CLASES_SEMAFORO[color]}`} style={{ width: `${pct}%` }} />
                </div>
              )}

              <div className="mt-2 flex items-center gap-2">
                <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs">
                  {(["FIJO", "PORCENTAJE"] as TipoTope[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() =>
                        setEdiciones((prev) => ({ ...prev, [c.id]: { ...fila, tipo: t } }))
                      }
                      className={`rounded-md px-2 py-1 ${
                        fila.tipo === t ? "bg-white font-medium text-slate-900 shadow-sm" : "text-slate-500"
                      }`}
                    >
                      {t === "FIJO" ? "$" : "%"}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder={fila.tipo === "FIJO" ? "Monto en pesos" : "% del ingreso"}
                  value={fila.valorTexto}
                  onChange={(e) =>
                    setEdiciones((prev) => ({
                      ...prev,
                      [c.id]: { ...fila, valorTexto: e.target.value.replace(/[^0-9.]/g, "") },
                    }))
                  }
                  onBlur={() => guardarFila(c.id, fila)}
                  className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
