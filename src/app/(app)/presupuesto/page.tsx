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
  const [gastoNoPresupuestable, setGastoNoPresupuestable] = useState(0);
  const [ediciones, setEdiciones] = useState<Record<number, FilaEdicion>>({});
  const [copiando, setCopiando] = useState(false);
  const [mensajeError, setMensajeError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const [{ data: cats }, { data: catsFijas }, { data: pres }, { data: vistaData }, { data: resumen }] =
      await Promise.all([
        supabase
          .from("categorias")
          .select("*")
          .eq("tipo", "GASTO")
          .eq("activa", true)
          .eq("presupuestable", true)
          .order("orden"),
        supabase.from("categorias").select("id").eq("tipo", "GASTO").eq("activa", true).eq("presupuestable", false),
        supabase.from("presupuestos").select("*").eq("periodo", periodo),
        supabase.from("v_presupuesto_mes").select("*").eq("periodo", periodo),
        supabase.from("v_resumen_mensual").select("*").eq("periodo", periodo).maybeSingle(),
      ]);
    setCategorias(cats ?? []);
    setPresupuestos(pres ?? []);
    setVista(vistaData ?? []);
    setIngresoRecurrente(resumen?.ingreso_recurrente ?? 0);

    const idsFijos = (catsFijas ?? []).map((c) => c.id);
    if (idsFijos.length > 0) {
      const { data: movsFijos } = await supabase
        .from("v_movimientos")
        .select("monto")
        .eq("periodo_devengado", periodo)
        .eq("tipo_flujo", "GASTO")
        .in("categoria_id", idsFijos);
      setGastoNoPresupuestable((movsFijos ?? []).reduce((a, m) => a + m.monto, 0));
    } else {
      setGastoNoPresupuestable(0);
    }

    const nuevasEdiciones: Record<number, FilaEdicion> = {};
    for (const c of cats ?? []) {
      const actual = (pres ?? []).find((p) => p.categoria_id === c.id);
      if (actual) {
        nuevasEdiciones[c.id] = {
          tipo: actual.tipo,
          valorTexto:
            actual.tipo === "FIJO"
              ? String(Math.round(actual.valor))
              : actual.tipo === "PORCENTAJE"
              ? String(actual.valor * 100)
              : "",
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

  // orden: primero con tope en $ o %, despues las de "= gasto real", al final las sin asignar
  const categoriasOrdenadas = useMemo(() => {
    const grupoDe = (c: Categoria) => {
      const tipo = vistaPorCategoria.get(c.nombre)?.tipo;
      if (tipo === "FIJO" || tipo === "PORCENTAJE") return 0;
      if (tipo === "REAL") return 1;
      return 2;
    };
    return [...categorias].sort((a, b) => grupoDe(a) - grupoDe(b));
  }, [categorias, vistaPorCategoria]);

  const sumaTopes = useMemo(() => vista.reduce((acc, v) => acc + v.tope, 0), [vista]);
  const disponibleParaPresupuestar = ingresoRecurrente - gastoNoPresupuestable;
  const ahorroProyectado = disponibleParaPresupuestar - sumaTopes;

  async function guardarFila(categoriaId: number, fila: FilaEdicion) {
    let valor = 0;
    if (fila.tipo !== "REAL") {
      const numero = Number(fila.valorTexto || "0");
      if (numero <= 0) return;
      valor = fila.tipo === "FIJO" ? Math.round(numero) : numero / 100;
    }
    const { error } = await supabase
      .from("presupuestos")
      .upsert({ periodo, categoria_id: categoriaId, tipo: fila.tipo, valor }, { onConflict: "periodo,categoria_id" });
    if (error) {
      setMensajeError(`No se pudo guardar: ${error.message}`);
      setTimeout(() => setMensajeError(null), 4000);
      return;
    }
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
        <Linea etiqueta="1. Ingreso recurrente del mes" valor={formatoPesos(ingresoRecurrente)} />
        <p className="mb-2 text-[11px] text-slate-400">Lo que entra de sueldo cada mes.</p>

        <Linea etiqueta="2. Disponible" valor={formatoPesos(disponibleParaPresupuestar)} />
        <p className="mb-2 text-[11px] text-slate-400">
          Ingreso menos lo ya gastado en fijos y deudas ({formatoPesos(gastoNoPresupuestable)}) — categorias que no
          se presupuestan aqui, pero igual descuentan apenas las registras en Registrar.
        </p>

        <div className="border-t border-slate-100 pt-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">3. Por asignar</span>
            <span className={`text-xl font-semibold ${ahorroProyectado < 0 ? "text-red-600" : "text-slate-900"}`}>
              {formatoPesos(ahorroProyectado)}
            </span>
          </div>
          <p className="text-[11px] text-slate-400">
            Disponible menos los topes que le pones a cada categoria abajo (bajan solas apenas asignas $, % o
            &quot;= gasto real&quot;). Si llega a $0, ya repartiste todo.
          </p>
        </div>
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
        {categoriasOrdenadas.map((c) => {
          const fila = ediciones[c.id] ?? { tipo: "FIJO" as TipoTope, valorTexto: "" };
          const v = vistaPorCategoria.get(c.nombre);
          const esReal = v?.tipo === "REAL";
          const color = v ? colorSemaforo(v.gastado, v.tope) : "verde";
          const pct = v && v.tope > 0 ? Math.min(100, Math.round((v.gastado / v.tope) * 100)) : 0;

          return (
            <div key={c.id} className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">{c.nombre}</span>
                {v && (
                  <span className="text-xs text-slate-500">
                    {formatoPesos(v.gastado)} {esReal ? "" : `/ ${formatoPesos(v.tope)}`}
                  </span>
                )}
              </div>

              {v && (
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full ${esReal ? "bg-sky-400" : CLASES_SEMAFORO[color]}`} style={{ width: `${pct}%` }} />
                </div>
              )}

              <div className="mt-2 flex items-center gap-2">
                <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs">
                  {(["FIJO", "PORCENTAJE", "REAL"] as TipoTope[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        const nuevaFila = { ...fila, tipo: t };
                        setEdiciones((prev) => ({ ...prev, [c.id]: nuevaFila }));
                        if (t === "REAL") guardarFila(c.id, nuevaFila);
                      }}
                      className={`rounded-md px-2 py-1 ${
                        fila.tipo === t ? "bg-white font-medium text-slate-900 shadow-sm" : "text-slate-500"
                      }`}
                    >
                      {t === "FIJO" ? "$" : t === "PORCENTAJE" ? "%" : "= gasto real"}
                    </button>
                  ))}
                </div>
                {fila.tipo !== "REAL" && (
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
                )}
              </div>
            </div>
          );
        })}
      </div>

      {mensajeError && (
        <p className="fixed inset-x-0 bottom-20 mx-auto w-fit rounded-full bg-red-600 px-4 py-2 text-sm text-white shadow-lg">
          {mensajeError}
        </p>
      )}
    </div>
  );
}

function Linea({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500">{etiqueta}</span>
      <span className="font-medium text-slate-700">{valor}</span>
    </div>
  );
}
