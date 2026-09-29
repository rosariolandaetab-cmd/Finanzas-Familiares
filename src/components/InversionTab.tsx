"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase/client";
import { formatoPesos, hoyISO } from "@/lib/formato";
import {
  actualizarValorActivo,
  archivarActivo,
  crearActivo,
  deshacerOperacion,
  obtenerPortafolio,
  registrarRetiroInversion,
  registrarTraspaso,
  TIPOS_ACTIVO,
  type Portafolio,
  type ResumenActivo,
} from "@/lib/inversion";
import { EvolucionParticipantesChart, type PuntoParticipantes } from "@/components/EvolucionParticipantesChart";
import type { MovActivoInversion, MovimientoInversion, TipoActivoInversion, TipoMovActivo } from "@/types/database";

type Accion = "VALOR" | "TRASPASO" | "RETIRO" | "NUEVO" | null;

const COLORES_PARTICIPANTE: Record<string, string> = {
  Rocha: "#B5602F",
  Lalo: "#7C8A5E",
};

const ETIQUETA_TIPO_MOV: Record<TipoMovActivo, string> = {
  SALDO_INICIAL: "Saldo inicial",
  APORTE: "Aporte",
  RETIRO: "Retiro",
  TRASPASO: "Traspaso",
  VALOR: "Actualizacion de valor",
};

function porcentaje(valor: number | null) {
  if (valor === null) return "—";
  const pct = Math.round(valor * 1000) / 10;
  return `${pct > 0 ? "+" : ""}${pct.toLocaleString("es-CL")}%`;
}

function fechaCorta(fecha: string) {
  return new Date(fecha + "T00:00:00").toLocaleDateString("es-CL");
}

export function InversionTab() {
  const { persona } = useAuth();
  const [portafolio, setPortafolio] = useState<Portafolio | null>(null);
  const [historialAnterior, setHistorialAnterior] = useState<MovimientoInversion[]>([]);
  const [nombresParticipantes, setNombresParticipantes] = useState<Map<number, string>>(new Map());
  const [comentariosMov, setComentariosMov] = useState<Map<string, string>>(new Map());
  const [cargando, setCargando] = useState(true);

  const [accion, setAccion] = useState<Accion>(null);
  const [activoId, setActivoId] = useState<number | null>(null);
  const [destinoId, setDestinoId] = useState<number | null>(null);
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(hoyISO());
  const [comentario, setComentario] = useState("");
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [tipoNuevo, setTipoNuevo] = useState<TipoActivoInversion>("FONDO");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const [operacionAbierta, setOperacionAbierta] = useState<string | null>(null);
  const [verAnterior, setVerAnterior] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    const [p, { data: anterior }, { data: todos }] = await Promise.all([
      obtenerPortafolio(),
      supabase.from("inversion_movimientos").select("*").order("fecha", { ascending: false }).limit(300),
      supabase.from("inversion_participantes").select("*"),
    ]);
    setPortafolio(p);
    setHistorialAnterior(anterior ?? []);
    setNombresParticipantes(new Map((todos ?? []).map((x) => [x.id, x.nombre])));
    // el comentario de un aporte hecho desde Registrar queda en el movimiento de la cuenta comun
    const idsMov = Array.from(new Set(p.movs.map((m) => m.movimiento_id).filter((id): id is string => !!id)));
    if (idsMov.length > 0) {
      const { data: movs } = await supabase.from("movimientos").select("id, comentario").in("id", idsMov);
      setComentariosMov(new Map((movs ?? []).filter((m) => m.comentario).map((m) => [m.id, m.comentario as string])));
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const activosVigentes = useMemo(() => (portafolio?.activos ?? []).filter((a) => a.activo), [portafolio]);
  const nombreActivo = useCallback(
    (id: number) => portafolio?.activos.find((a) => a.id === id)?.nombre ?? "?",
    [portafolio]
  );

  const operaciones = useMemo(() => {
    if (!portafolio) return [];
    const porOperacion = new Map<string, MovActivoInversion[]>();
    for (const m of portafolio.movs) {
      if (!porOperacion.has(m.operacion_id)) porOperacion.set(m.operacion_id, []);
      porOperacion.get(m.operacion_id)!.push(m);
    }
    const lista = Array.from(porOperacion.entries()).map(([id, filas]) => {
      const tipo = filas[0].tipo;
      const origen = filas.find((f) => f.monto < 0);
      const destino = filas.find((f) => f.monto > 0);
      const descripcion =
        tipo === "TRASPASO" && origen && destino
          ? `${nombreActivo(origen.activo_id)} → ${nombreActivo(destino.activo_id)}`
          : nombreActivo(filas[0].activo_id);
      const monto = tipo === "TRASPASO" ? Math.abs(filas[0].monto) : filas.reduce((s, f) => s + f.monto, 0);
      const notas = filas
        .flatMap((f) => [f.comentario, f.movimiento_id ? comentariosMov.get(f.movimiento_id) : undefined])
        .filter((c): c is string => !!c);
      const creadoEn = filas.reduce((max, f) => (f.creado_en > max ? f.creado_en : max), "");
      return {
        id,
        tipo,
        fecha: filas[0].fecha,
        descripcion,
        monto,
        comentarios: Array.from(new Set(notas)),
        cuotas: portafolio.cuotas.filter((c) => c.operacion_id === id),
        creadoEn,
      };
    });
    return lista.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creadoEn.localeCompare(a.creadoEn));
  }, [portafolio, comentariosMov, nombreActivo]);

  // la ultima operacion ingresada (no la de fecha mas nueva) es la unica que se puede deshacer
  const ultimaOperacionId = useMemo(
    () => operaciones.reduce<{ id: string; creadoEn: string } | null>((max, op) => (!max || op.creadoEn > max.creadoEn ? op : max), null)?.id,
    [operaciones]
  );

  // evolucion del valor de cada persona: cuotas de cada uno x valor cuota de ese dia
  const evolucion = useMemo(() => {
    if (!portafolio) return [];
    const fechas = Array.from(new Set([...portafolio.movs.map((m) => m.fecha), ...portafolio.cuotas.map((c) => c.fecha)])).sort();
    let total = 0;
    const cuotas = new Map<number, number>();
    const puntos: PuntoParticipantes[] = [];
    for (const f of fechas) {
      total += portafolio.movs.filter((m) => m.fecha === f).reduce((s, m) => s + m.monto, 0);
      for (const c of portafolio.cuotas.filter((x) => x.fecha === f)) {
        cuotas.set(c.participante_id, (cuotas.get(c.participante_id) ?? 0) + Number(c.cuotas));
      }
      const cuotasTotales = Array.from(cuotas.values()).reduce((s, n) => s + n, 0);
      const valorCuota = cuotasTotales > 0 ? total / cuotasTotales : 0;
      const punto: PuntoParticipantes = {
        etiqueta: new Date(f + "T00:00:00").toLocaleDateString("es-CL", { day: "numeric", month: "short" }),
      };
      for (const p of portafolio.participantes) punto[p.nombre] = Math.round((cuotas.get(p.id) ?? 0) * valorCuota);
      puntos.push(punto);
    }
    return puntos;
  }, [portafolio]);

  function avisar(texto: string, ms = 2500) {
    setMensaje(texto);
    setTimeout(() => setMensaje(null), ms);
  }

  function abrir(a: Accion, activo?: ResumenActivo) {
    setAccion(a);
    setActivoId(activo?.id ?? (activosVigentes.length === 1 ? activosVigentes[0].id : null));
    setDestinoId(null);
    setMonto(a === "VALOR" && activo ? String(activo.valor) : "");
    setFecha(hoyISO());
    setComentario("");
    setNombreNuevo("");
    setTipoNuevo("FONDO");
  }

  async function confirmar() {
    const montoNumero = Number(monto || "0");
    const nota = comentario.trim() || null;
    const creadoPor = persona?.id ?? null;
    setGuardando(true);
    let error: string | null = null;
    let exito = "";

    if (accion === "NUEVO") {
      ({ error } = await crearActivo(nombreNuevo.trim(), tipoNuevo, nota));
      exito = "Inversion creada ✓";
    } else if (accion === "VALOR" && activoId) {
      const r = await actualizarValorActivo({ activoId, valorNuevo: montoNumero, fecha, comentario: nota, creadoPor });
      error = r.error;
      exito = `${r.diferencia >= 0 ? "Ganancia" : "Perdida"} de ${formatoPesos(Math.abs(r.diferencia))} registrada ✓`;
    } else if (accion === "TRASPASO" && activoId && destinoId) {
      ({ error } = await registrarTraspaso({ origenId: activoId, destinoId, monto: montoNumero, fecha, comentario: nota, creadoPor }));
      exito = "Traspaso registrado ✓";
    } else if (accion === "RETIRO" && activoId) {
      ({ error } = await registrarRetiroInversion({ activoId, monto: montoNumero, fecha, comentario: nota, creadoPor }));
      exito = "Retiro registrado ✓";
    }

    setGuardando(false);
    if (error) {
      avisar(error, 3500);
      return;
    }
    avisar(exito);
    setAccion(null);
    cargar();
  }

  async function eliminarActivo(a: ResumenActivo) {
    if (!confirm(`¿Eliminar "${a.nombre}"? Su historial se conserva.`)) return;
    const { error } = await archivarActivo(a);
    if (error) {
      avisar(error, 3500);
      return;
    }
    cargar();
  }

  async function deshacer(operacionId: string) {
    if (!confirm("¿Deshacer esta operacion? Si vino de Registrar, tambien se borra ese movimiento.")) return;
    await deshacerOperacion(operacionId);
    avisar("Operacion deshecha ✓");
    cargar();
  }

  if (cargando || !portafolio) {
    return <div className="flex min-h-[40dvh] items-center justify-center text-taupe/70">Cargando...</div>;
  }

  const puedeConfirmar =
    !guardando &&
    (accion === "NUEVO"
      ? !!nombreNuevo.trim()
      : !!activoId && monto !== "" && (accion === "VALOR" || Number(monto) > 0) && (accion !== "TRASPASO" || !!destinoId));

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-ink p-4 text-white">
        <p className="text-xs uppercase tracking-wide text-taupe/50">Total invertido</p>
        <p className="mt-1 text-2xl font-semibold">{formatoPesos(portafolio.total)}</p>
        <p className="mt-1 text-xs text-white/70">
          Ganancia acumulada {formatoPesos(portafolio.gananciaTotal)} ·{" "}
          {porcentaje(portafolio.total - portafolio.gananciaTotal > 0 ? portafolio.gananciaTotal / (portafolio.total - portafolio.gananciaTotal) : null)}
        </p>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium text-taupe">¿De quien es?</h2>
        <div className="grid grid-cols-2 gap-2">
          {portafolio.participantes.map((p) => (
            <div key={p.id} className="rounded-2xl bg-white p-3 ring-1 ring-sand">
              <p className="text-xs text-taupe">
                {p.nombre} · {Math.round(p.porcentaje * 100)}%
              </p>
              <p className="mt-1 text-lg font-semibold text-ink">{formatoPesos(p.valor)}</p>
              <p className="text-[11px] text-taupe/70">
                Puso {formatoPesos(p.aportado)} · gano {formatoPesos(p.valor - p.aportado)}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-taupe/70">
          Todo es una bolsa comun. Cada aporte compra cuotas segun los sueldos del mes; las ganancias suben el valor de
          la cuota (hoy {formatoPesos(portafolio.valorCuota)}).
        </p>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium text-taupe">¿Donde esta?</h2>
        <div className="space-y-2">
          {activosVigentes.length === 0 && (
            <p className="text-sm text-taupe/70">
              Todavia no hay inversiones. Si no has corrido 08_portafolio_inversion.sql en Supabase, correlo primero.
            </p>
          )}
          {activosVigentes.map((a) => (
            <div key={a.id} className="rounded-2xl bg-white p-3 ring-1 ring-sand">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-ink">{a.nombre}</p>
                  <p className="text-[11px] text-taupe/70">
                    {TIPOS_ACTIVO.find((t) => t.valor === a.tipo)?.etiqueta ?? a.tipo} ·{" "}
                    {portafolio.total > 0 ? Math.round((a.valor / portafolio.total) * 100) : 0}% del total
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-base font-semibold text-ink">{formatoPesos(a.valor)}</p>
                  <p className={`text-[11px] ${a.ganancia < 0 ? "text-red-600" : "text-emerald-700"}`}>
                    {porcentaje(a.retorno)} ({formatoPesos(a.ganancia)})
                  </p>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <button type="button" onClick={() => eliminarActivo(a)} className="text-red-600">
                  Eliminar
                </button>
                <button
                  type="button"
                  onClick={() => abrir("VALOR", a)}
                  className="rounded-full bg-cream px-2.5 py-1 font-medium text-ink"
                >
                  Actualizar valor
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => abrir("TRASPASO")}
          className="min-h-11 rounded-2xl bg-white py-3 text-sm font-semibold text-ink ring-1 ring-sand"
        >
          Traspasar
        </button>
        <button
          type="button"
          onClick={() => abrir("RETIRO")}
          className="min-h-11 rounded-2xl bg-orange-600 py-3 text-sm font-semibold text-white"
        >
          Retirar
        </button>
        <button
          type="button"
          onClick={() => abrir("NUEVO")}
          className="min-h-11 rounded-2xl bg-clay py-3 text-sm font-semibold text-white"
        >
          + Nueva
        </button>
      </div>
      <p className="-mt-4 text-xs text-taupe/70">
        Para poner plata, ve a Registrar → Transferencia → Aporte a inversion y elige donde va.
      </p>

      {accion && (
        <div className="space-y-2 rounded-2xl bg-white p-3 ring-2 ring-clay">
          <p className="text-sm font-medium text-ink">
            {accion === "NUEVO"
              ? "Nueva inversion"
              : accion === "VALOR"
              ? "¿Cuanto vale hoy?"
              : accion === "TRASPASO"
              ? "Mover plata entre inversiones"
              : "Retirar a la cuenta comun"}
          </p>

          {accion === "NUEVO" ? (
            <>
              <input
                type="text"
                autoFocus
                placeholder="Nombre (ej: Terreno Pucon, Prestamo a Juan)"
                value={nombreNuevo}
                onChange={(e) => setNombreNuevo(e.target.value)}
                className="w-full rounded-xl border border-sand px-3 py-2 text-sm"
              />
              <div className="flex flex-wrap gap-2">
                {TIPOS_ACTIVO.map((t) => (
                  <button
                    key={t.valor}
                    type="button"
                    onClick={() => setTipoNuevo(t.valor)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                      tipoNuevo === t.valor ? "bg-clay text-white" : "bg-cream text-ink/70"
                    }`}
                  >
                    {t.etiqueta}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-taupe/70">
                Parte en $0. Para llenarla, traspasa desde otra inversion o aporta desde Registrar.
              </p>
            </>
          ) : (
            <>
              <div>
                {accion === "TRASPASO" && <p className="mb-1 text-xs text-taupe">Desde</p>}
                <div className="flex flex-wrap gap-2">
                  {activosVigentes.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => {
                        setActivoId(a.id);
                        if (accion === "VALOR") setMonto(String(a.valor));
                      }}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                        activoId === a.id ? "bg-clay text-white" : "bg-cream text-ink/70"
                      }`}
                    >
                      {a.nombre}
                    </button>
                  ))}
                </div>
              </div>
              {accion === "TRASPASO" && (
                <div>
                  <p className="mb-1 text-xs text-taupe">Hacia</p>
                  <div className="flex flex-wrap gap-2">
                    {activosVigentes
                      .filter((a) => a.id !== activoId)
                      .map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => setDestinoId(a.id)}
                          className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                            destinoId === a.id ? "bg-clay text-white" : "bg-cream text-ink/70"
                          }`}
                        >
                          {a.nombre}
                        </button>
                      ))}
                  </div>
                </div>
              )}
              {accion === "VALOR" && activoId && (
                <p className="text-[11px] text-taupe/70">
                  Hoy registrado: {formatoPesos(activosVigentes.find((a) => a.id === activoId)?.valor ?? 0)}. Escribe el
                  valor que dice la cartola o tasacion; la diferencia queda como ganancia o perdida.
                </p>
              )}
              {accion === "RETIRO" && (
                <p className="text-[11px] text-taupe/70">
                  Entra a la cuenta comun como Retiro de inversion y se descuenta a Rocha y Lalo segun su %.
                </p>
              )}
              <input
                type="text"
                inputMode="numeric"
                placeholder="$0"
                value={monto}
                onChange={(e) => setMonto(e.target.value.replace(/[^0-9]/g, ""))}
                className="w-full rounded-xl border border-sand px-3 py-3 text-center text-2xl font-semibold"
              />
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full rounded-xl border border-sand px-3 py-2 text-sm"
              />
            </>
          )}
          <input
            type="text"
            placeholder="Comentario (opcional)"
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            className="w-full rounded-xl border border-sand px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={confirmar}
              disabled={!puedeConfirmar}
              className="flex-1 rounded-xl bg-clay py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {guardando ? "Guardando..." : "Confirmar"}
            </button>
            <button type="button" onClick={() => setAccion(null)} className="rounded-xl bg-cream px-3 py-2 text-sm">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {evolucion.length > 1 && (
        <div>
          <h2 className="mb-2 text-sm font-medium text-taupe">Evolucion por persona</h2>
          <div className="rounded-2xl bg-white p-2 ring-1 ring-sand">
            <EvolucionParticipantesChart
              datos={evolucion}
              series={portafolio.participantes.map((p) => ({ nombre: p.nombre, color: COLORES_PARTICIPANTE[p.nombre] ?? "#8A7A63" }))}
            />
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-2 text-sm font-medium text-taupe">Historial</h2>
        <div className="space-y-1">
          {operaciones.slice(0, 50).map((op) => {
            const abierta = operacionAbierta === op.id;
            return (
              <div key={op.id} className="rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-sand">
                <button type="button" onClick={() => setOperacionAbierta(abierta ? null : op.id)} className="w-full text-left">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <span className="font-medium text-ink">{ETIQUETA_TIPO_MOV[op.tipo]}</span>
                      <span className="ml-2 text-xs text-taupe/70">{op.descripcion}</span>
                      <p className={`text-xs text-taupe/70 ${abierta ? "" : "truncate"}`}>
                        {fechaCorta(op.fecha)}
                        {op.comentarios.length > 0 ? ` · ${op.comentarios.join(" · ")}` : ""}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 pl-2 ${
                        op.tipo === "TRASPASO" ? "text-taupe" : op.monto < 0 ? "text-orange-600" : "text-emerald-600"
                      }`}
                    >
                      {formatoPesos(op.monto)}
                    </span>
                  </div>
                </button>
                {abierta && (
                  <div className="mt-2 space-y-1 border-t border-sand/60 pt-2 text-xs text-taupe">
                    {op.cuotas.length === 0 ? (
                      <p>No cambia lo de cada uno: {op.tipo === "VALOR" ? "sube o baja el valor de la cuota" : "solo cambia donde esta la plata"}.</p>
                    ) : (
                      op.cuotas.map((c) => (
                        <div key={c.id} className="flex items-center justify-between">
                          <span>
                            {portafolio.participantes.find((p) => p.id === c.participante_id)?.nombre ?? "?"} ·{" "}
                            {Math.abs(Number(c.cuotas)).toLocaleString("es-CL", { maximumFractionDigits: 1 })} cuotas a{" "}
                            {formatoPesos(Number(c.valor_cuota))}
                          </span>
                          <span>{formatoPesos(c.monto)}</span>
                        </div>
                      ))
                    )}
                    {op.id === ultimaOperacionId && op.tipo !== "SALDO_INICIAL" && (
                      <button type="button" onClick={() => deshacer(op.id)} className="pt-1 text-red-600 underline">
                        Deshacer esta operacion
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {historialAnterior.length > 0 && (
        <div>
          <button type="button" onClick={() => setVerAnterior((v) => !v)} className="text-xs text-taupe/70 underline">
            {verAnterior ? "Ocultar" : "Ver"} historial anterior al portafolio ({historialAnterior.length})
          </button>
          {verAnterior && (
            <div className="mt-2 space-y-1">
              {historialAnterior.map((h) => (
                <div key={h.id} className="flex items-center justify-between rounded-xl bg-white/60 px-3 py-2 text-xs ring-1 ring-sand">
                  <span className="text-taupe">
                    {fechaCorta(h.fecha)} · {nombresParticipantes.get(h.participante_id) ?? "?"} · {h.tipo.toLowerCase()}
                    {h.comentario ? ` · ${h.comentario}` : ""}
                  </span>
                  <span className="text-ink">{formatoPesos(h.monto)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {mensaje && (
        <p className="fixed inset-x-0 bottom-20 mx-auto w-fit rounded-full bg-ink px-4 py-2 text-sm text-white shadow-lg">
          {mensaje}
        </p>
      )}
    </div>
  );
}
