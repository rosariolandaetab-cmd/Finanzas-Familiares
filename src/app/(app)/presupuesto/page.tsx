"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { formatoPesos, periodoActual, sumarMesesAPeriodo } from "@/lib/formato";
import { DesgloseSegmentado } from "@/components/DesgloseSegmentado";
import { SelectorPeriodo } from "@/components/SelectorPeriodo";
import { CLASES_SEMAFORO, colorSemaforo } from "@/lib/semaforo";
import type { Categoria, Presupuesto, PresupuestoInsert, TipoTope, VPresupuestoMes, VResumenMensual } from "@/types/database";

type FilaEdicion = { tipo: TipoTope; valorTexto: string };
type FilaCategoria = Categoria & { gastado: number; tope: number };

export default function PresupuestoPage() {
  const [periodo, setPeriodo] = useState(periodoActual());
  const [cargando, setCargando] = useState(true);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([]);
  const [vista, setVista] = useState<VPresupuestoMes[]>([]);
  const [resumen, setResumen] = useState<VResumenMensual | null>(null);
  const [ediciones, setEdiciones] = useState<Record<number, FilaEdicion>>({});
  const [sucios, setSucios] = useState<Set<number>>(new Set());
  const [copiando, setCopiando] = useState(false);
  const [guardandoLote, setGuardandoLote] = useState(false);
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const [mensajeOk, setMensajeOk] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const [{ data: cats }, { data: pres }, { data: vistaData }, { data: resumenData }] = await Promise.all([
      supabase.from("categorias").select("*").eq("tipo", "GASTO").eq("activa", true).order("orden"),
      supabase.from("presupuestos").select("*").eq("periodo", periodo),
      supabase.from("v_presupuesto_mes").select("*").eq("periodo", periodo),
      supabase.from("v_resumen_mensual").select("*").eq("periodo", periodo).maybeSingle(),
    ]);
    setCategorias(cats ?? []);
    setPresupuestos(pres ?? []);
    setVista(vistaData ?? []);
    setResumen(resumenData ?? null);

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
    setSucios(new Set());
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

  const filas: FilaCategoria[] = useMemo(
    () =>
      categorias.map((c) => {
        const v = vistaPorCategoria.get(c.nombre);
        return { ...c, gastado: v?.gastado ?? 0, tope: v?.tope ?? 0 };
      }),
    [categorias, vistaPorCategoria]
  );

  const ingresoRecurrente = resumen?.ingreso_recurrente ?? 0;
  const montoDisponible = resumen ? resumen.ingreso_recurrente + resumen.ingreso_extraordinario - resumen.gasto_total : 0;
  const sumaTopes = useMemo(() => vista.reduce((acc, v) => acc + v.tope, 0), [vista]);
  const porGastar = ingresoRecurrente - sumaTopes;

  function marcarSucio(categoriaId: number, fila: FilaEdicion) {
    setEdiciones((prev) => ({ ...prev, [categoriaId]: fila }));
    setSucios((prev) => new Set(prev).add(categoriaId));
  }

  async function guardarFilaReal(categoriaId: number) {
    const fila: FilaEdicion = { tipo: "REAL", valorTexto: "" };
    setEdiciones((prev) => ({ ...prev, [categoriaId]: fila }));
    const { error } = await supabase
      .from("presupuestos")
      .upsert({ periodo, categoria_id: categoriaId, tipo: "REAL", valor: 0 }, { onConflict: "periodo,categoria_id" });
    if (error) {
      setMensajeError(`No se pudo guardar: ${error.message}`);
      setTimeout(() => setMensajeError(null), 4000);
      return;
    }
    cargar();
  }

  async function guardarCambios() {
    const filasAGuardar: PresupuestoInsert[] = [];
    for (const categoriaId of sucios) {
      const fila = ediciones[categoriaId];
      if (!fila || fila.tipo === "REAL") continue;
      const numero = Number(fila.valorTexto || "0");
      if (numero <= 0) continue;
      const valor = fila.tipo === "FIJO" ? Math.round(numero) : numero / 100;
      filasAGuardar.push({ periodo, categoria_id: categoriaId, tipo: fila.tipo, valor });
    }
    if (filasAGuardar.length === 0) {
      setSucios(new Set());
      return;
    }
    setGuardandoLote(true);
    const { error } = await supabase.from("presupuestos").upsert(filasAGuardar, { onConflict: "periodo,categoria_id" });
    setGuardandoLote(false);
    if (error) {
      setMensajeError(`No se pudo guardar: ${error.message}`);
      setTimeout(() => setMensajeError(null), 4000);
      return;
    }
    setMensajeOk(`${filasAGuardar.length} categoria(s) guardada(s) ✓`);
    setTimeout(() => setMensajeOk(null), 2500);
    await cargar();
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
    return <div className="flex min-h-[60dvh] items-center justify-center text-taupe/70">Cargando...</div>;
  }

  return (
    <div className="mx-auto max-w-md space-y-6 p-4 pb-24">
      <SelectorPeriodo periodo={periodo} onChange={setPeriodo} />

      <div className="rounded-2xl bg-white p-4 ring-1 ring-sand">
        <Linea etiqueta="1. Ingreso recurrente" valor={formatoPesos(ingresoRecurrente)} />
        <p className="mb-2 text-[11px] text-taupe/70">Lo que entra de sueldo cada mes.</p>

        <Linea etiqueta="2. Monto disponible" valor={formatoPesos(montoDisponible)} />
        <p className="mb-2 text-[11px] text-taupe/70">
          El resultado del mes: ingreso total menos todo lo gastado hasta ahora.
        </p>

        <div className="border-t border-sand/60 pt-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-ink">3. Por gastar</span>
            <span className={`text-xl font-semibold ${porGastar < 0 ? "text-red-600" : "text-ink"}`}>
              {formatoPesos(porGastar)}
            </span>
          </div>
          <p className="text-[11px] text-taupe/70">
            Ingreso recurrente menos los topes que le pusiste a cada categoria abajo. La idea es llegar a $0: eso
            significa que ya repartiste todo el ingreso del mes.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={copiarMesAnterior}
        disabled={copiando}
        className="w-full rounded-2xl bg-cream py-2.5 text-sm font-medium text-ink disabled:opacity-50"
      >
        {copiando ? "Copiando..." : "Copiar topes del mes anterior"}
      </button>

      <DesgloseSegmentado
        filas={filas}
        keyDe={(c) => String(c.id)}
        renderFila={(c) => {
          const fila = ediciones[c.id] ?? { tipo: "FIJO" as TipoTope, valorTexto: "" };
          const v = vistaPorCategoria.get(c.nombre);
          const esReal = v?.tipo === "REAL";
          const pct = v && v.tope > 0 ? Math.min(100, Math.round((v.gastado / v.tope) * 100)) : 0;
          const color = v ? colorSemaforo(v.gastado, v.tope) : "verde";

          return (
            <div className="rounded-2xl bg-white p-3 ring-1 ring-sand">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-ink">{c.nombre}</span>
                {v && (
                  <span className="text-xs text-taupe">
                    {formatoPesos(v.gastado)} {esReal ? "" : `/ ${formatoPesos(v.tope)}`}
                  </span>
                )}
              </div>

              {v && (
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-cream">
                  <div
                    className={`h-full ${esReal ? "bg-sky-400" : CLASES_SEMAFORO[color]}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}

              <div className="mt-2 flex items-center gap-2">
                <div className="flex rounded-xl bg-cream p-0.5 text-xs">
                  {(["FIJO", "PORCENTAJE", "REAL"] as TipoTope[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        if (t === "REAL") {
                          guardarFilaReal(c.id);
                        } else {
                          marcarSucio(c.id, { ...fila, tipo: t });
                        }
                      }}
                      className={`rounded-lg px-2 py-1 ${
                        fila.tipo === t ? "bg-white font-medium text-ink shadow-sm" : "text-taupe"
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
                    onChange={(e) => marcarSucio(c.id, { ...fila, valorTexto: e.target.value.replace(/[^0-9.]/g, "") })}
                    className="flex-1 rounded-xl border border-sand px-2 py-1.5 text-sm"
                  />
                )}
              </div>
            </div>
          );
        }}
      />

      {sucios.size > 0 && (
        <div className="fixed inset-x-0 bottom-20 mx-auto w-fit">
          <button
            type="button"
            onClick={guardarCambios}
            disabled={guardandoLote}
            className="rounded-full bg-clay px-6 py-3 text-sm font-semibold text-white shadow-lg disabled:opacity-50"
          >
            {guardandoLote ? "Guardando..." : `Guardar cambios (${sucios.size})`}
          </button>
        </div>
      )}

      {mensajeError && (
        <p className="fixed inset-x-0 bottom-20 mx-auto w-fit rounded-full bg-red-600 px-4 py-2 text-sm text-white shadow-lg">
          {mensajeError}
        </p>
      )}
      {mensajeOk && (
        <p className="fixed inset-x-0 bottom-20 mx-auto w-fit rounded-full bg-ink px-4 py-2 text-sm text-white shadow-lg">
          {mensajeOk}
        </p>
      )}
    </div>
  );
}

function Linea({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-taupe">{etiqueta}</span>
      <span className="font-medium text-ink">{valor}</span>
    </div>
  );
}
