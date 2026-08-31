"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { etiquetaPeriodo, formatoPesos, periodoActual, sumarMesesAPeriodo } from "@/lib/formato";
import { AhorroChart } from "@/components/AhorroChart";
import { Sparkline } from "@/components/Sparkline";
import type { Categoria, Recurrencia, TipoFlujo, VMovimiento, VPresupuestoMes, VResumenMensual } from "@/types/database";

const RANGOS = [3, 6, 12] as const;
const UMBRAL_ALERTA = 0.15;
const NOMBRES_MES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function ultimosPeriodos(n: number) {
  const actual = periodoActual();
  const lista: string[] = [];
  for (let i = n - 1; i >= 0; i--) lista.push(sumarMesesAPeriodo(actual, -i));
  return lista;
}

const CATEGORIA_ARRIENDO = "Arriendo Deptos";
const CATEGORIA_CUOTA = "Cuota Deptos";
const CATEGORIA_CONTRIBUCIONES = "Contribuciones deptos";

type ModoRango = "RAPIDO" | "PERSONALIZADO";

export default function AnalisisPage() {
  const [cargando, setCargando] = useState(true);
  const [modoRango, setModoRango] = useState<ModoRango>("RAPIDO");
  const [rangoMeses, setRangoMeses] = useState<(typeof RANGOS)[number]>(6);
  const [anioPersonalizado, setAnioPersonalizado] = useState(() => Number(periodoActual().slice(0, 4)));
  const [mesesSeleccionados, setMesesSeleccionados] = useState<Set<string>>(new Set());
  const [filtroTipo, setFiltroTipo] = useState<TipoFlujo | "TODOS">("GASTO");
  const [filtroGrupo, setFiltroGrupo] = useState<string>("TODOS");
  const [soloAlerta, setSoloAlerta] = useState(false);
  const [categoriaExpandida, setCategoriaExpandida] = useState<string | null>(null);
  const [chequeoAbierto, setChequeoAbierto] = useState<string | null>(null);

  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [resumenes, setResumenes] = useState<VResumenMensual[]>([]);
  const [movs, setMovs] = useState<
    Pick<VMovimiento, "categoria" | "grupo" | "tipo_flujo" | "monto" | "periodo_devengado" | "recurrencia">[]
  >([]);
  const [movsDeptos, setMovsDeptos] = useState<Pick<VMovimiento, "categoria" | "monto">[]>([]);
  const [resumenMesActual, setResumenMesActual] = useState<VResumenMensual | null>(null);
  const [gastoRecurrenteMesActual, setGastoRecurrenteMesActual] = useState(0);
  const [presupuestoMesActual, setPresupuestoMesActual] = useState<VPresupuestoMes[]>([]);

  const periodosVentana = useMemo(() => {
    if (modoRango === "PERSONALIZADO") return Array.from(mesesSeleccionados).sort();
    return ultimosPeriodos(rangoMeses);
  }, [modoRango, rangoMeses, mesesSeleccionados]);

  useEffect(() => {
    let cancelado = false;
    async function cargar() {
      setCargando(true);
      const periodosFijos = ultimosPeriodos(6);
      const periodos = Array.from(new Set([...periodosFijos, ...periodosVentana]));
      const mesActual = periodoActual();

      const [
        { data: catsData },
        { data: resumenData },
        { data: movsData },
        { data: deptosData },
        { data: resumenActualData },
        { data: movsRecurrentesActual },
        { data: presupuestoData },
      ] = await Promise.all([
        supabase.from("categorias").select("*").eq("activa", true),
        supabase.from("v_resumen_mensual").select("*").in("periodo", periodos),
        periodos.length > 0
          ? supabase
              .from("v_movimientos")
              .select("categoria, grupo, tipo_flujo, monto, periodo_devengado, recurrencia")
              .in("tipo_flujo", ["GASTO", "INGRESO"])
              .in("periodo_devengado", periodos)
          : Promise.resolve({ data: [] }),
        supabase
          .from("v_movimientos")
          .select("categoria, monto")
          .in("categoria", [CATEGORIA_ARRIENDO, CATEGORIA_CUOTA, CATEGORIA_CONTRIBUCIONES]),
        supabase.from("v_resumen_mensual").select("*").eq("periodo", mesActual).maybeSingle(),
        supabase
          .from("v_movimientos")
          .select("monto")
          .eq("periodo_devengado", mesActual)
          .eq("tipo_flujo", "GASTO")
          .eq("recurrencia", "RECURRENTE"),
        supabase.from("v_presupuesto_mes").select("*").eq("periodo", mesActual),
      ]);
      if (cancelado) return;
      setCategorias(catsData ?? []);
      setResumenes(resumenData ?? []);
      setMovs(movsData ?? []);
      setMovsDeptos(deptosData ?? []);
      setResumenMesActual(resumenActualData ?? null);
      setGastoRecurrenteMesActual((movsRecurrentesActual ?? []).reduce((a, m) => a + m.monto, 0));
      setPresupuestoMesActual(presupuestoData ?? []);
      setCargando(false);
    }
    cargar();
    return () => {
      cancelado = true;
    };
  }, [periodosVentana]);

  const cantidadMesesVentana = periodosVentana.length || 1;

  const evolucionAhorro = useMemo(() => {
    const gastoPorPeriodoYRecurrencia = (periodo: string, recurrencia: Recurrencia) =>
      movs
        .filter((m) => m.tipo_flujo === "GASTO" && m.periodo_devengado === periodo && m.recurrencia === recurrencia)
        .reduce((a, m) => a + m.monto, 0);

    return periodosVentana.map((p) => {
      const r = resumenes.find((x) => x.periodo === p);
      const gastoRecurrente = gastoPorPeriodoYRecurrencia(p, "RECURRENTE");
      const gastoExtraordinario = gastoPorPeriodoYRecurrencia(p, "EXTRAORDINARIO");
      return {
        etiqueta: etiquetaPeriodo(p).split(" ")[0].slice(0, 3) + " " + p.slice(2, 4),
        ahorroRecurrente: (r?.ingreso_recurrente ?? 0) - gastoRecurrente,
        ahorroNoRecurrente: (r?.ingreso_extraordinario ?? 0) - gastoExtraordinario,
      };
    });
  }, [periodosVentana, resumenes, movs]);

  const gruposDisponibles = useMemo(() => {
    const tipos = filtroTipo === "TODOS" ? (["GASTO", "INGRESO"] as TipoFlujo[]) : [filtroTipo];
    const set = new Set<string>();
    for (const c of categorias) {
      if (tipos.includes(c.tipo)) set.add(c.grupo);
    }
    return Array.from(set);
  }, [categorias, filtroTipo]);

  const porCategoria = useMemo(() => {
    const p6 = ultimosPeriodos(6);
    const ultimos3 = new Set(p6.slice(3));
    const anteriores3 = new Set(p6.slice(0, 3));
    const ventanaSet = new Set(periodosVentana);

    type Acc = { grupo: string; tipo: TipoFlujo; total: number; ultimos3: number; anteriores3: number; porMes: Map<string, number> };
    const mapa = new Map<string, Acc>();

    for (const m of movs) {
      if (!ventanaSet.has(m.periodo_devengado) && !ultimos3.has(m.periodo_devengado) && !anteriores3.has(m.periodo_devengado)) {
        continue;
      }
      const actual = mapa.get(m.categoria) ?? {
        grupo: m.grupo,
        tipo: m.tipo_flujo,
        total: 0,
        ultimos3: 0,
        anteriores3: 0,
        porMes: new Map<string, number>(),
      };
      if (ventanaSet.has(m.periodo_devengado)) {
        actual.total += m.monto;
        actual.porMes.set(m.periodo_devengado, (actual.porMes.get(m.periodo_devengado) ?? 0) + m.monto);
      }
      if (ultimos3.has(m.periodo_devengado)) actual.ultimos3 += m.monto;
      if (anteriores3.has(m.periodo_devengado)) actual.anteriores3 += m.monto;
      mapa.set(m.categoria, actual);
    }

    return Array.from(mapa.entries())
      .map(([categoria, v]) => {
        const promedio = v.total / cantidadMesesVentana;
        const variacion = v.anteriores3 > 0 ? (v.ultimos3 - v.anteriores3) / v.anteriores3 : v.ultimos3 > 0 ? 1 : 0;
        const serie = periodosVentana.map((p) => v.porMes.get(p) ?? 0);
        return { categoria, grupo: v.grupo, tipo: v.tipo, promedio, ultimos3: v.ultimos3, anteriores3: v.anteriores3, variacion, serie };
      })
      .filter((c) => (filtroTipo === "TODOS" ? true : c.tipo === filtroTipo))
      .filter((c) => (filtroGrupo === "TODOS" ? true : c.grupo === filtroGrupo))
      .filter((c) => (soloAlerta ? c.variacion > UMBRAL_ALERTA : true))
      .sort((a, b) => b.promedio - a.promedio);
  }, [movs, cantidadMesesVentana, periodosVentana, filtroTipo, filtroGrupo, soloAlerta]);

  const cajaDeptos = useMemo(() => {
    const suma = (nombre: string) => movsDeptos.filter((m) => m.categoria === nombre).reduce((a, m) => a + m.monto, 0);
    const arriendos = suma(CATEGORIA_ARRIENDO);
    const cuotas = suma(CATEGORIA_CUOTA);
    const contribuciones = suma(CATEGORIA_CONTRIBUCIONES);
    return { arriendos, cuotas, contribuciones, neta: arriendos - cuotas - contribuciones };
  }, [movsDeptos]);

  const chequeos = useMemo(() => {
    const r = resumenMesActual;
    const tasaAhorro = r && r.ingreso_recurrente > 0 ? (r.ingreso_recurrente - gastoRecurrenteMesActual) / r.ingreso_recurrente : 0;
    const fijosDeudas = r && r.ingreso_recurrente > 0 ? (r.fijos + r.deudas) / r.ingreso_recurrente : 0;
    const resultado = r ? r.ingreso_recurrente + r.ingreso_extraordinario - r.gasto_total : 0;
    const categoriasSobreTope = presupuestoMesActual.filter((p) => p.gastado > p.tope || (p.tope <= 0 && p.gastado > 0));

    return [
      { nombre: "Tasa de ahorro recurrente sobre 20%", ok: tasaAhorro >= 0.2, detalle: `${Math.round(tasaAhorro * 100)}%`, lista: null as string[] | null },
      { nombre: "Fijos + deudas bajo 50% del ingreso", ok: fijosDeudas <= 0.5, detalle: `${Math.round(fijosDeudas * 100)}%`, lista: null },
      { nombre: "Resultado del mes positivo", ok: resultado >= 0, detalle: formatoPesos(resultado), lista: null },
      {
        nombre: "Todas las categorias dentro de su tope",
        ok: categoriasSobreTope.length === 0,
        detalle: presupuestoMesActual.length === 0 ? "sin presupuesto" : `${categoriasSobreTope.length} sobre tope`,
        lista: categoriasSobreTope.length > 0 ? categoriasSobreTope.map((c) => c.categoria) : null,
      },
    ];
  }, [resumenMesActual, gastoRecurrenteMesActual, presupuestoMesActual]);

  function alternarMes(periodo: string) {
    setMesesSeleccionados((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(periodo)) nuevo.delete(periodo);
      else nuevo.add(periodo);
      return nuevo;
    });
  }

  if (cargando) {
    return <div className="flex min-h-[60dvh] items-center justify-center text-slate-400">Cargando...</div>;
  }

  return (
    <div className="mx-auto max-w-md space-y-6 p-4">
      <div>
        <div className="flex gap-2">
          {RANGOS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => {
                setModoRango("RAPIDO");
                setRangoMeses(r);
              }}
              className={`flex-1 rounded-full py-1.5 text-xs font-medium ${
                modoRango === "RAPIDO" && rangoMeses === r
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-600 ring-1 ring-inset ring-slate-300"
              }`}
            >
              {r} meses
            </button>
          ))}
          <button
            type="button"
            onClick={() => setModoRango("PERSONALIZADO")}
            className={`flex-1 rounded-full py-1.5 text-xs font-medium ${
              modoRango === "PERSONALIZADO" ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-inset ring-slate-300"
            }`}
          >
            Elegir meses
          </button>
        </div>

        {modoRango === "PERSONALIZADO" && (
          <div className="mt-2 rounded-xl bg-white p-3 ring-1 ring-slate-200">
            <div className="mb-2 flex items-center justify-between">
              <button type="button" onClick={() => setAnioPersonalizado((a) => a - 1)} className="px-2 text-slate-500">
                ‹
              </button>
              <span className="text-sm font-medium text-slate-700">{anioPersonalizado}</span>
              <button type="button" onClick={() => setAnioPersonalizado((a) => a + 1)} className="px-2 text-slate-500">
                ›
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {NOMBRES_MES_CORTO.map((nombreMes, i) => {
                const periodo = `${anioPersonalizado}-${String(i + 1).padStart(2, "0")}`;
                const seleccionado = mesesSeleccionados.has(periodo);
                return (
                  <button
                    key={periodo}
                    type="button"
                    onClick={() => alternarMes(periodo)}
                    className={`rounded-lg py-1.5 text-xs font-medium ${
                      seleccionado ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {nombreMes}
                  </button>
                );
              })}
            </div>
            {mesesSeleccionados.size === 0 ? (
              <p className="mt-2 text-xs text-slate-400">Elige uno o mas meses para filtrar.</p>
            ) : (
              <div className="mt-3 border-t border-slate-100 pt-2">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">Meses elegidos (de cualquier año)</span>
                  <button type="button" onClick={() => setMesesSeleccionados(new Set())} className="text-[11px] text-blue-600">
                    Limpiar todo
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from(mesesSeleccionados)
                    .sort()
                    .map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => alternarMes(p)}
                        className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700"
                      >
                        {etiquetaPeriodo(p)} ✕
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium text-slate-500">Chequeos de salud (mes actual)</h2>
        <div className="space-y-1.5 rounded-2xl bg-white p-3 ring-1 ring-slate-200">
          {chequeos.map((c) => {
            const puedeAbrir = !!c.lista && c.lista.length > 0;
            const abierto = chequeoAbierto === c.nombre;
            return (
              <div key={c.nombre}>
                <button
                  type="button"
                  disabled={!puedeAbrir}
                  onClick={() => setChequeoAbierto(abierto ? null : c.nombre)}
                  className="flex w-full items-center justify-between text-left text-sm disabled:cursor-default"
                >
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${c.ok ? "bg-emerald-500" : "bg-red-500"}`} />
                    <span className="text-slate-700">{c.nombre}</span>
                  </div>
                  <span className={c.ok ? "text-emerald-600" : "text-red-600"}>
                    {c.detalle}
                    {puedeAbrir ? (abierto ? " ▲" : " ▼") : ""}
                  </span>
                </button>
                {abierto && c.lista && (
                  <ul className="mt-1 space-y-0.5 pl-4 text-xs text-slate-500">
                    {c.lista.map((nombre) => (
                      <li key={nombre}>• {nombre}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium text-slate-500">Ahorro recurrente vs no recurrente</h2>
        <div className="rounded-2xl bg-white p-2 ring-1 ring-slate-200">
          <AhorroChart datos={evolucionAhorro} />
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
        <h2 className="mb-2 text-sm font-medium text-slate-500">Por categoria</h2>

        <div className="mb-2 flex flex-wrap gap-2">
          {(["GASTO", "INGRESO", "TODOS"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setFiltroTipo(t);
                setFiltroGrupo("TODOS");
              }}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                filtroTipo === t ? "bg-blue-600 text-white" : "bg-white text-slate-600 ring-1 ring-inset ring-slate-300"
              }`}
            >
              {t === "GASTO" ? "Gasto" : t === "INGRESO" ? "Ingreso" : "Todos"}
            </button>
          ))}
        </div>

        <div className="mb-2 flex flex-wrap gap-2">
          <select
            value={filtroGrupo}
            onChange={(e) => setFiltroGrupo(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
          >
            <option value="TODOS">Todos los grupos</option>
            {gruposDisponibles.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setSoloAlerta((v) => !v)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              soloAlerta ? "bg-red-600 text-white" : "bg-white text-slate-600 ring-1 ring-inset ring-slate-300"
            }`}
          >
            Solo con alerta
          </button>
        </div>

        <div className="space-y-2">
          {porCategoria.length === 0 && <p className="text-sm text-slate-400">Sin datos para estos filtros.</p>}
          {porCategoria.map((c) => {
            const alerta = c.variacion > UMBRAL_ALERTA;
            const expandida = categoriaExpandida === c.categoria;
            return (
              <button
                key={c.categoria}
                type="button"
                onClick={() => setCategoriaExpandida(expandida ? null : c.categoria)}
                className="w-full rounded-xl bg-white p-3 text-left ring-1 ring-slate-200"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">
                    {c.categoria}
                    {alerta && <span className="ml-1.5 text-red-600">⚠</span>}
                  </span>
                  <Sparkline valores={c.serie} color={c.tipo === "INGRESO" ? "#2563eb" : "#ea580c"} />
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
                  <span>promedio {formatoPesos(c.promedio)}</span>
                  <span
                    className={`font-medium ${
                      c.variacion > 0.02 ? "text-red-600" : c.variacion < -0.02 ? "text-emerald-600" : "text-slate-400"
                    }`}
                  >
                    {c.variacion > 0.02 ? "↑" : c.variacion < -0.02 ? "↓" : "→"} {Math.round(c.variacion * 100)}%
                  </span>
                </div>
                {expandida && (
                  <div className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-500">
                    <div className="flex justify-between">
                      <span>3 meses anteriores</span>
                      <span>{formatoPesos(c.anteriores3)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Ultimos 3 meses</span>
                      <span>{formatoPesos(c.ultimos3)}</span>
                    </div>
                  </div>
                )}
              </button>
            );
          })}
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
