"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase/client";
import { formatoPesos, hoyISO } from "@/lib/formato";
import { actualizarSaldoInicial, obtenerSaldos, registrarGanancia, registrarRetiro } from "@/lib/inversion";
import { EvolucionParticipantesChart, type PuntoParticipantes } from "@/components/EvolucionParticipantesChart";
import type { MovimientoInversion, ParticipanteInversion, VInversionSaldo } from "@/types/database";

type Accion = "GANANCIA" | "RETIRO" | null;
type ModoReparto = "TODOS" | "ROCHA_LALO" | "UNO";

const COLORES_PARTICIPANTE: Record<string, string> = {
  Rocha: "#B5602F",
  Lalo: "#7C8A5E",
  "Bajo Lalo": "#8A7A63",
};

export default function InversionPage() {
  const { persona } = useAuth();
  const [saldos, setSaldos] = useState<VInversionSaldo[]>([]);
  const [participantes, setParticipantes] = useState<ParticipanteInversion[]>([]);
  const [historial, setHistorial] = useState<MovimientoInversion[]>([]);
  const [cargando, setCargando] = useState(true);

  const [accion, setAccion] = useState<Accion>(null);
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(hoyISO());
  const [comentario, setComentario] = useState("");
  const [modoReparto, setModoReparto] = useState<ModoReparto>("TODOS");
  const [participanteUnico, setParticipanteUnico] = useState<number | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const [editandoSaldoId, setEditandoSaldoId] = useState<number | null>(null);
  const [saldoInicialTexto, setSaldoInicialTexto] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    const [s, { data: parts }, { data: hist }] = await Promise.all([
      obtenerSaldos(),
      supabase.from("inversion_participantes").select("*").eq("activo", true).order("id"),
      supabase.from("inversion_movimientos").select("*").order("fecha", { ascending: false }).limit(300),
    ]);
    setSaldos(s);
    setParticipantes(parts ?? []);
    setHistorial(hist ?? []);
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const totalFondo = saldos.reduce((a, s) => a + Math.max(0, s.saldo_actual), 0);
  const gananciaAcumulada = historial.filter((h) => h.tipo === "GANANCIA").reduce((a, h) => a + h.monto, 0);

  const evolucionParticipantes = useMemo(() => {
    const nombres = participantes.map((p) => p.nombre);
    const idANombre = new Map(participantes.map((p) => [p.id, p.nombre]));
    const corridas = new Map<string, number>(participantes.map((p) => [p.nombre, p.saldo_inicial]));

    const ordenAsc = [...historial].sort((a, b) => a.fecha.localeCompare(b.fecha));
    const fechasUnicas = Array.from(new Set(ordenAsc.map((h) => h.fecha))).sort();

    const puntoInicio: PuntoParticipantes = { etiqueta: "Inicio" };
    for (const n of nombres) puntoInicio[n] = corridas.get(n) ?? 0;
    const puntos: PuntoParticipantes[] = [puntoInicio];

    for (const fecha of fechasUnicas) {
      for (const h of ordenAsc.filter((x) => x.fecha === fecha)) {
        const nombre = idANombre.get(h.participante_id);
        if (!nombre) continue;
        corridas.set(nombre, (corridas.get(nombre) ?? 0) + h.monto);
      }
      const punto: PuntoParticipantes = {
        etiqueta: new Date(fecha + "T00:00:00").toLocaleDateString("es-CL", { day: "numeric", month: "short" }),
      };
      for (const n of nombres) punto[n] = corridas.get(n) ?? 0;
      puntos.push(punto);
    }
    return puntos;
  }, [historial, participantes]);

  const seriesParticipantes = participantes.map((p) => ({
    nombre: p.nombre,
    color: COLORES_PARTICIPANTE[p.nombre] ?? "#8A7A63",
  }));

  function limpiarForm() {
    setAccion(null);
    setMonto("");
    setFecha(hoyISO());
    setComentario("");
    setModoReparto("TODOS");
    setParticipanteUnico(null);
  }

  async function confirmar() {
    const montoNumero = Number(monto || "0");
    if (montoNumero <= 0 || !accion) return;
    if (accion === "GANANCIA" && modoReparto === "UNO" && !participanteUnico) return;
    setGuardando(true);

    const base = { monto: montoNumero, fecha, comentario: comentario.trim() || null, creadoPor: persona?.id ?? null };

    let error: string | null;
    if (accion === "GANANCIA") {
      const rochaLaloIds = participantes.filter((p) => p.nombre === "Rocha" || p.nombre === "Lalo").map((p) => p.id);
      const participantesIds =
        modoReparto === "UNO" && participanteUnico
          ? [participanteUnico]
          : modoReparto === "ROCHA_LALO"
          ? rochaLaloIds
          : undefined;
      ({ error } = await registrarGanancia({ ...base, participantesIds }));
    } else {
      ({ error } = await registrarRetiro(base));
    }

    setGuardando(false);
    if (error) {
      setMensaje(error);
      setTimeout(() => setMensaje(null), 3000);
      return;
    }
    setMensaje(accion === "GANANCIA" ? "Ganancia repartida ✓" : "Retiro registrado ✓");
    setTimeout(() => setMensaje(null), 2000);
    limpiarForm();
    cargar();
  }

  async function guardarSaldoInicial(participanteId: number) {
    const valor = Number(saldoInicialTexto.replace(/[^0-9]/g, "") || "0");
    await actualizarSaldoInicial(participanteId, valor);
    setEditandoSaldoId(null);
    cargar();
  }

  if (cargando) {
    return <div className="flex min-h-[60dvh] items-center justify-center text-taupe/70">Cargando...</div>;
  }

  return (
    <div className="mx-auto max-w-md space-y-6 p-4">
      <div className="rounded-2xl bg-ink p-4 text-white">
        <p className="text-xs uppercase tracking-wide text-taupe/50">Total en inversion</p>
        <p className="mt-1 text-2xl font-semibold">{formatoPesos(totalFondo)}</p>
      </div>

      <div className="space-y-2">
        {saldos.map((s) => (
          <div key={s.id} className="rounded-2xl bg-white p-3 ring-1 ring-sand">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink">{s.nombre}</span>
              <span className="text-base font-semibold text-ink">{formatoPesos(s.saldo_actual)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-taupe/70">
              <span>{totalFondo > 0 ? Math.round((Math.max(0, s.saldo_actual) / totalFondo) * 100) : 0}% del total</span>
              {editandoSaldoId === s.id ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoFocus
                    placeholder="Saldo inicial"
                    value={saldoInicialTexto}
                    onChange={(e) => setSaldoInicialTexto(e.target.value)}
                    className="w-28 rounded-lg border border-sand px-2 py-1 text-xs"
                  />
                  <button onClick={() => guardarSaldoInicial(s.id)} className="text-clay">
                    Guardar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setEditandoSaldoId(s.id);
                    const p = participantes.find((p) => p.id === s.id);
                    setSaldoInicialTexto(p ? String(p.saldo_inicial) : "");
                  }}
                  className="underline"
                >
                  Ajustar saldo inicial
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-taupe/70">
        Para aportar plata a la inversion, ve a Registrar → Transferencia → Aporte a inversion. Se reparte solo
        segun los sueldos del mes.
      </p>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium text-taupe">Evolucion del fondo</h2>
          <span className="text-xs text-taupe/70">Ganancia acumulada: {formatoPesos(gananciaAcumulada)}</span>
        </div>
        <div className="rounded-2xl bg-white p-2 ring-1 ring-sand">
          <EvolucionParticipantesChart datos={evolucionParticipantes} series={seriesParticipantes} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setAccion("GANANCIA")}
          className="min-h-11 rounded-2xl bg-emerald-600 py-3 text-sm font-semibold text-white"
        >
          Registrar ganancia
        </button>
        <button
          type="button"
          onClick={() => setAccion("RETIRO")}
          className="min-h-11 rounded-2xl bg-orange-600 py-3 text-sm font-semibold text-white"
        >
          Retirar
        </button>
      </div>

      {accion && (
        <div className="space-y-2 rounded-2xl bg-white p-3 ring-2 ring-clay">
          {accion === "GANANCIA" ? (
            <div>
              <p className="mb-1.5 text-sm font-medium text-ink">Repartir entre</p>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { valor: "TODOS", etiqueta: "Los 3" },
                    { valor: "ROCHA_LALO", etiqueta: "Solo Rocha y Lalo" },
                    { valor: "UNO", etiqueta: "Solo uno" },
                  ] as { valor: ModoReparto; etiqueta: string }[]
                ).map((op) => (
                  <button
                    key={op.valor}
                    type="button"
                    onClick={() => setModoReparto(op.valor)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                      modoReparto === op.valor ? "bg-clay text-white" : "bg-cream text-ink/70"
                    }`}
                  >
                    {op.etiqueta}
                  </button>
                ))}
              </div>
              {modoReparto === "UNO" && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {participantes.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setParticipanteUnico(p.id)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                        participanteUnico === p.id ? "bg-clay text-white" : "bg-cream text-ink/70"
                      }`}
                    >
                      {p.nombre}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm font-medium text-ink">Retiro entre Rocha y Lalo</p>
          )}
          <input
            type="text"
            inputMode="numeric"
            autoFocus
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
              disabled={guardando || !monto || (accion === "GANANCIA" && modoReparto === "UNO" && !participanteUnico)}
              className="flex-1 rounded-xl bg-clay py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {guardando ? "Guardando..." : "Confirmar"}
            </button>
            <button type="button" onClick={limpiarForm} className="rounded-xl bg-cream px-3 py-2 text-sm">
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-2 text-sm font-medium text-taupe">Historial</h2>
        <div className="space-y-1">
          {historial.slice(0, 30).map((h) => {
            const nombre = participantes.find((p) => p.id === h.participante_id)?.nombre ?? "?";
            return (
              <div key={h.id} className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-sand">
                <div>
                  <span className="font-medium text-ink">{nombre}</span>
                  <span className="ml-2 text-xs text-taupe/70">{h.tipo.toLowerCase()}</span>
                  <p className="text-xs text-taupe/70">{new Date(h.fecha + "T00:00:00").toLocaleDateString("es-CL")}</p>
                </div>
                <span className={h.monto < 0 ? "text-orange-600" : "text-emerald-600"}>{formatoPesos(h.monto)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {mensaje && (
        <p className="fixed inset-x-0 bottom-20 mx-auto w-fit rounded-full bg-ink px-4 py-2 text-sm text-white shadow-lg">
          {mensaje}
        </p>
      )}
    </div>
  );
}
