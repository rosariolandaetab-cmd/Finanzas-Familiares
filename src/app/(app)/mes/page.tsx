"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { etiquetaPeriodo, formatoPesos, periodoActual, sumarMesesAPeriodo } from "@/lib/formato";
import { arrastreDelMes, guardarConfigArrastre, obtenerConfigArrastre, type ArrastreMes, type ConfigArrastre } from "@/lib/arrastre";
import { CLASES_SEMAFORO, colorSemaforo } from "@/lib/semaforo";
import { aportesInversionPeriodo } from "@/lib/inversion";
import { aportesFondosPeriodo } from "@/lib/fondos";
import { SelectorPeriodo } from "@/components/SelectorPeriodo";
import { WaterfallChart } from "@/components/WaterfallChart";
import { DesgloseSegmentado } from "@/components/DesgloseSegmentado";
import type { Cuenta, VDeudaTarjeta, VMovimiento, VPresupuestoMes, VResumenMensual } from "@/types/database";

function proximoVencimiento(diaVencimiento: number | null): string | null {
  if (!diaVencimiento) return null;
  const hoy = new Date();
  let candidato = new Date(hoy.getFullYear(), hoy.getMonth(), diaVencimiento);
  if (candidato < hoy) {
    candidato = new Date(hoy.getFullYear(), hoy.getMonth() + 1, diaVencimiento);
  }
  return candidato.toLocaleDateString("es-CL", { day: "numeric", month: "long" });
}

function nivelFijosDeudas(pct: number): { color: "verde" | "ambar" | "rojo"; etiqueta: string } {
  if (pct > 0.7) return { color: "rojo", etiqueta: "Critico" };
  if (pct > 0.5) return { color: "ambar", etiqueta: "Atencion" };
  return { color: "verde", etiqueta: "Saludable" };
}

const CLASE_TEXTO_NIVEL: Record<"verde" | "ambar" | "rojo", string> = {
  verde: "text-emerald-600",
  ambar: "text-amber-600",
  rojo: "text-red-600",
};

export default function MesPage() {
  const [periodo, setPeriodo] = useState(periodoActual());
  const [cargando, setCargando] = useState(true);
  const [resumen, setResumen] = useState<VResumenMensual | null>(null);
  const [presupuestoMes, setPresupuestoMes] = useState<VPresupuestoMes[]>([]);
  const [deudas, setDeudas] = useState<VDeudaTarjeta[]>([]);
  const [tarjetas, setTarjetas] = useState<Cuenta[]>([]);
  const [movimientosGasto, setMovimientosGasto] = useState<VMovimiento[]>([]);
  const [categoriaAbierta, setCategoriaAbierta] = useState<string | null>(null);
  const [ahorroFondosEInversion, setAhorroFondosEInversion] = useState(0);
  const [mostrarInfoFijos, setMostrarInfoFijos] = useState(false);
  const [configArrastre, setConfigArrastre] = useState<ConfigArrastre | null>(null);
  const [arrastre, setArrastre] = useState<ArrastreMes | null>(null);
  const [editandoArrastre, setEditandoArrastre] = useState(false);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let cancelado = false;
    async function cargar() {
      setCargando(true);
      const [
        { data: resumenData },
        { data: presupuestoData },
        { data: deudaData },
        { data: tarjetasData },
        { data: movsGasto },
        aportesFondos,
        aportesInversion,
        config,
      ] = await Promise.all([
        supabase.from("v_resumen_mensual").select("*").eq("periodo", periodo).maybeSingle(),
        supabase.from("v_presupuesto_mes").select("*").eq("periodo", periodo),
        supabase.from("v_deuda_tarjeta").select("*"),
        supabase.from("cuentas").select("*").eq("tipo", "TARJETA_CREDITO").eq("activa", true),
        supabase
          .from("v_movimientos")
          .select("*")
          .eq("periodo_devengado", periodo)
          .eq("tipo_flujo", "GASTO")
          .order("fecha_compra", { ascending: false }),
        aportesFondosPeriodo(periodo),
        aportesInversionPeriodo(periodo),
        obtenerConfigArrastre(),
      ]);
      const arrastreMes = await arrastreDelMes(periodo, config);
      if (cancelado) return;
      setConfigArrastre(config);
      setArrastre(arrastreMes);
      setResumen(resumenData ?? null);
      setPresupuestoMes(presupuestoData ?? []);
      setDeudas(deudaData ?? []);
      setTarjetas(tarjetasData ?? []);
      setMovimientosGasto(movsGasto ?? []);
      setAhorroFondosEInversion(aportesFondos + aportesInversion);
      setCategoriaAbierta(null);
      setCargando(false);
    }
    cargar();
    return () => {
      cancelado = true;
    };
  }, [periodo, recarga]);

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
    const tasaAhorro = ingresoTotal > 0 ? ahorroFondosEInversion / ingresoTotal : 0;
    const fijosDeudasSobreIngreso = r.ingreso_recurrente > 0 ? (r.fijos + r.deudas) / r.ingreso_recurrente : 0;
    return { ...r, ingresoTotal, resultado, tasaAhorro, fijosDeudasSobreIngreso };
  }, [resumen, ahorroFondosEInversion]);

  const pasosCascada = useMemo(() => {
    const flujoDelMes = [
      { nombre: "Ingreso recurrente", delta: indicadores.ingreso_recurrente, tipo: "ingreso" as const },
      { nombre: "Extraordinario", delta: indicadores.ingreso_extraordinario, tipo: "ingreso" as const },
      { nombre: "Fijos", delta: -indicadores.fijos, tipo: "salida" as const },
      { nombre: "Deudas", delta: -indicadores.deudas, tipo: "salida" as const },
      { nombre: "Asignacion personal", delta: -indicadores.asignacion_personal, tipo: "salida" as const },
      { nombre: "Variables", delta: -indicadores.variables, tipo: "salida" as const },
    ];
    if (!arrastre) {
      return [...flujoDelMes, { nombre: "Resultado", delta: indicadores.resultado, tipo: "resultado" as const }];
    }
    // con arrastre: parte con lo que quedo del mes anterior y termina en lo
    // que pasa al siguiente, descontando lo guardado en fondos/inversion
    return [
      {
        nombre: "Mes anterior",
        delta: arrastre.saldoAnterior,
        tipo: arrastre.saldoAnterior >= 0 ? ("ingreso" as const) : ("salida" as const),
      },
      ...flujoDelMes,
      { nombre: "Fondos e inversion", delta: -arrastre.flujo.ahorroNeto, tipo: "salida" as const },
      { nombre: "Saldo final", delta: arrastre.saldoFinal, tipo: "resultado" as const },
    ];
  }, [indicadores, arrastre]);

  const nivelFijos = nivelFijosDeudas(indicadores.fijosDeudasSobreIngreso);

  if (cargando) {
    return <div className="flex min-h-[60dvh] items-center justify-center text-taupe/70">Cargando...</div>;
  }

  return (
    <div className="mx-auto max-w-md space-y-6 p-4">
      <SelectorPeriodo periodo={periodo} onChange={setPeriodo} />

      {deudas.length > 0 && (
        <div className="rounded-2xl bg-ink p-4 text-white">
          <p className="text-xs uppercase tracking-wide text-taupe/50">Deuda de tarjeta hoy</p>
          <div className="mt-2 space-y-2">
            {deudas.map((d) => {
              const cuenta = tarjetas.find((t) => t.nombre === d.tarjeta);
              const vence = proximoVencimiento(cuenta?.dia_vencimiento ?? null);
              const href = `/historial?estado=PENDIENTE${cuenta ? `&cuenta=${cuenta.id}` : ""}`;
              return (
                <Link key={d.tarjeta} href={href} className="flex items-center justify-between">
                  <span className="text-sm">
                    {d.tarjeta}
                    <span className="block text-[11px] text-taupe/70">
                      {d.compras} compra{d.compras === 1 ? "" : "s"} pendiente{d.compras === 1 ? "" : "s"} · ver detalle ›
                    </span>
                  </span>
                  <div className="text-right">
                    <div className="text-lg font-semibold">{formatoPesos(d.total_pendiente)}</div>
                    {vence && <div className="text-[11px] text-taupe/70">vence el {vence}</div>}
                  </div>
                </Link>
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
          etiqueta="Ahorro (fondos + inversion)"
          valor={`${Math.round(indicadores.tasaAhorro * 100)}%`}
        />
        <button type="button" onClick={() => setMostrarInfoFijos((v) => !v)} className="text-left">
          <div className="rounded-2xl bg-white p-3 ring-1 ring-sand">
            <p className="text-[11px] text-taupe">Fijos + deudas / ingreso</p>
            <p className={`mt-1 text-lg font-semibold ${CLASE_TEXTO_NIVEL[nivelFijos.color]}`}>
              {Math.round(indicadores.fijosDeudasSobreIngreso * 100)}%
            </p>
            <p className={`text-[10px] font-medium uppercase ${CLASE_TEXTO_NIVEL[nivelFijos.color]}`}>
              {nivelFijos.etiqueta} · toca para ver
            </p>
          </div>
        </button>
      </div>

      <TarjetaArrastre
        periodo={periodo}
        arrastre={arrastre}
        config={configArrastre}
        editando={editandoArrastre}
        onEditar={setEditandoArrastre}
        onGuardado={() => {
          setEditandoArrastre(false);
          setRecarga((n) => n + 1);
        }}
      />

      {mostrarInfoFijos && (
        <div className="rounded-2xl bg-white p-4 text-sm ring-1 ring-sand">
          <p className="font-medium text-ink">¿Que significa este numero?</p>
          <p className="mt-1 text-taupe">
            Es cuanto de tu ingreso recurrente ya esta comprometido en gastos fijos (arriendo, cuentas, seguros) y
            deudas, antes de gastar en variables o guardar algo.
          </p>
          <ul className="mt-2 space-y-1 text-taupe">
            <li>
              <span className="font-medium text-emerald-600">Hasta 50%: saludable.</span> Te queda buen margen para
              variables y ahorro.
            </li>
            <li>
              <span className="font-medium text-amber-600">50% a 70%: atencion.</span> Queda poco margen; conviene no
              sumar mas gastos fijos ni deudas nuevas.
            </li>
            <li>
              <span className="font-medium text-red-600">Sobre 70%: critico.</span> Casi todo el ingreso esta
              comprometido. Revisa si puedes renegociar deudas, bajar algun gasto fijo (suscripciones, planes) o
              aumentar el ingreso recurrente.
            </li>
          </ul>
        </div>
      )}

      <div>
        <h2 className="mb-2 text-sm font-medium text-taupe">Flujo del mes</h2>
        <div className="rounded-2xl bg-white p-2 ring-1 ring-sand">
          <WaterfallChart pasos={pasosCascada} />
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium text-taupe">Categorias vs presupuesto</h2>
        {presupuestoMes.length === 0 ? (
          <p className="text-sm text-taupe/70">
            Todavia no hay presupuesto definido para este mes. Configuralo en la pestana Presupuesto.
          </p>
        ) : (
          <DesgloseSegmentado
            filas={presupuestoMes}
            keyDe={(c) => c.categoria}
            renderFila={(c) => {
              const esReal = c.tipo === "REAL";
              const color = colorSemaforo(c.gastado, c.tope);
              const pct = c.tope > 0 ? Math.min(100, Math.round((c.gastado / c.tope) * 100)) : 100;
              const abierta = categoriaAbierta === c.categoria;
              const movsCategoria = abierta ? movimientosGasto.filter((m) => m.categoria === c.categoria) : [];
              return (
                <button
                  type="button"
                  onClick={() => setCategoriaAbierta(abierta ? null : c.categoria)}
                  className="w-full rounded-2xl bg-white p-3 text-left ring-1 ring-sand"
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-ink">{c.categoria}</span>
                    <span className="text-taupe">
                      {formatoPesos(c.gastado)} {esReal ? "" : `/ ${formatoPesos(c.tope)}`}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-cream">
                    <div className={`h-full ${esReal ? "bg-sky-400" : CLASES_SEMAFORO[color]}`} style={{ width: `${pct}%` }} />
                  </div>
                  {abierta && (
                    <div className="mt-3 space-y-1.5 border-t border-sand/60 pt-2">
                      {movsCategoria.length === 0 ? (
                        <p className="text-xs text-taupe/70">Sin movimientos este mes.</p>
                      ) : (
                        movsCategoria.map((m) => (
                          <div key={m.id} className="flex items-center justify-between text-xs">
                            <span className="text-taupe">
                              {new Date(m.fecha_compra + "T00:00:00").toLocaleDateString("es-CL")}
                              {m.comentario ? ` · ${m.comentario}` : ""}
                            </span>
                            <span className="font-medium text-ink">{formatoPesos(m.monto)}</span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </button>
              );
            }}
          />
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
    <div className="rounded-2xl bg-white p-3 ring-1 ring-sand">
      <p className="text-[11px] text-taupe">{etiqueta}</p>
      <p className={`mt-1 text-lg font-semibold ${negativo ? "text-red-600" : "text-ink"}`}>{valor}</p>
    </div>
  );
}

function TarjetaArrastre({
  periodo,
  arrastre,
  config,
  editando,
  onEditar,
  onGuardado,
}: {
  periodo: string;
  arrastre: ArrastreMes | null;
  config: ConfigArrastre | null;
  editando: boolean;
  onEditar: (v: boolean) => void;
  onGuardado: () => void;
}) {
  const [desde, setDesde] = useState(config?.desde ?? periodo);
  const [saldoTexto, setSaldoTexto] = useState(String(config?.saldoInicial ?? 0));
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (editando) {
      setDesde(config?.desde ?? periodo);
      setSaldoTexto(String(config?.saldoInicial ?? 0));
    }
  }, [editando, config, periodo]);

  async function guardar() {
    setGuardando(true);
    await guardarConfigArrastre({ desde, saldoInicial: Number(saldoTexto.replace(/[^0-9-]/g, "") || "0") });
    setGuardando(false);
    onGuardado();
  }

  if (editando) {
    return (
      <div className="space-y-2 rounded-2xl bg-white p-4 text-sm ring-2 ring-clay">
        <p className="font-medium text-ink">Saldo que pasa de un mes a otro</p>
        <p className="text-xs text-taupe">
          Elige el primer mes que recibe saldo y con cuanto parte (lo que quedo disponible al cerrar el mes anterior).
          Desde ahi, lo que sobre o falte de cada mes pasa solo al siguiente.
        </p>
        <label className="block text-xs text-taupe">
          Primer mes
          <input
            type="month"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="mt-1 w-full rounded-xl border border-sand px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-xs text-taupe">
          Parte con (usa - si parte en negativo)
          <input
            type="text"
            inputMode="numeric"
            value={saldoTexto}
            onChange={(e) => setSaldoTexto(e.target.value.replace(/[^0-9-]/g, ""))}
            className="mt-1 w-full rounded-xl border border-sand px-3 py-2 text-sm"
          />
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={guardar}
            disabled={guardando || !desde}
            className="flex-1 rounded-xl bg-clay py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {guardando ? "Guardando..." : "Guardar"}
          </button>
          <button type="button" onClick={() => onEditar(false)} className="rounded-xl bg-cream px-3 py-2 text-sm">
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <p className="rounded-2xl bg-amber-50 p-3 text-xs text-amber-800">
        Para que el saldo de cada mes pase al siguiente, corre el script 07_fondos_dinamicos_y_arrastre.sql en Supabase.
      </p>
    );
  }

  if (!arrastre) {
    return (
      <button type="button" onClick={() => onEditar(true)} className="w-full text-left text-xs text-taupe/70 underline">
        El saldo entre meses se cuenta desde {etiquetaPeriodo(config.desde)}. Cambiar
      </button>
    );
  }

  const siguiente = etiquetaPeriodo(sumarMesesAPeriodo(periodo, 1));
  return (
    <div className="rounded-2xl bg-white p-3 text-sm ring-1 ring-sand">
      <div className="flex items-center justify-between">
        <span className="text-taupe">Viene del mes anterior</span>
        <span className={`font-semibold ${arrastre.saldoAnterior < 0 ? "text-red-600" : "text-ink"}`}>
          {formatoPesos(arrastre.saldoAnterior)}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between">
        <span className="text-taupe">Guardado en fondos e inversion</span>
        <span className="text-ink">{formatoPesos(arrastre.flujo.ahorroNeto)}</span>
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-sand/60 pt-2">
        <span className="font-medium text-ink">Pasa a {siguiente}</span>
        <span className={`text-base font-semibold ${arrastre.saldoFinal < 0 ? "text-red-600" : "text-emerald-700"}`}>
          {formatoPesos(arrastre.saldoFinal)}
        </span>
      </div>
      <button type="button" onClick={() => onEditar(true)} className="mt-2 text-[11px] text-taupe/70 underline">
        Ajustar desde cuando se cuenta
      </button>
    </div>
  );
}
