"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase/client";
import { formatoPesos, hoyISO } from "@/lib/formato";
import { actualizarSaldoInicial, obtenerSaldos, registrarGanancia, registrarRetiro } from "@/lib/inversion";
import type { MovimientoInversion, ParticipanteInversion, VInversionSaldo } from "@/types/database";

type Accion = "GANANCIA" | "RETIRO" | null;

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
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const [editandoSaldoId, setEditandoSaldoId] = useState<number | null>(null);
  const [saldoInicialTexto, setSaldoInicialTexto] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    const [s, { data: parts }, { data: hist }] = await Promise.all([
      obtenerSaldos(),
      supabase.from("inversion_participantes").select("*").eq("activo", true).order("id"),
      supabase.from("inversion_movimientos").select("*").order("fecha", { ascending: false }).limit(60),
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

  function limpiarForm() {
    setAccion(null);
    setMonto("");
    setFecha(hoyISO());
    setComentario("");
  }

  async function confirmar() {
    const montoNumero = Number(monto || "0");
    if (montoNumero <= 0 || !accion) return;
    setGuardando(true);

    const payload = { monto: montoNumero, fecha, comentario: comentario.trim() || null, creadoPor: persona?.id ?? null };
    const { error } = accion === "GANANCIA" ? await registrarGanancia(payload) : await registrarRetiro(payload);

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
    return <div className="flex min-h-[60dvh] items-center justify-center text-slate-400">Cargando...</div>;
  }

  return (
    <div className="mx-auto max-w-md space-y-6 p-4">
      <div className="rounded-2xl bg-slate-900 p-4 text-white">
        <p className="text-xs uppercase tracking-wide text-slate-300">Total en inversion</p>
        <p className="mt-1 text-2xl font-semibold">{formatoPesos(totalFondo)}</p>
      </div>

      <div className="space-y-2">
        {saldos.map((s) => (
          <div key={s.id} className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">{s.nombre}</span>
              <span className="text-base font-semibold text-slate-900">{formatoPesos(s.saldo_actual)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
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
                    className="w-28 rounded-md border border-slate-300 px-2 py-1 text-xs"
                  />
                  <button onClick={() => guardarSaldoInicial(s.id)} className="text-blue-600">
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

      <p className="text-xs text-slate-400">
        Para aportar plata a la inversion, ve a Registrar → Transferencia → Aporte a inversion. Se reparte solo
        segun los sueldos del mes.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setAccion("GANANCIA")}
          className="rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white"
        >
          Registrar ganancia
        </button>
        <button
          type="button"
          onClick={() => setAccion("RETIRO")}
          className="rounded-xl bg-orange-600 py-3 text-sm font-semibold text-white"
        >
          Retirar
        </button>
      </div>

      {accion && (
        <div className="space-y-2 rounded-xl bg-white p-3 ring-2 ring-blue-500">
          <p className="text-sm font-medium text-slate-700">
            {accion === "GANANCIA" ? "Ganancia a repartir entre los 3" : "Retiro entre Rocha y Lalo"}
          </p>
          <input
            type="text"
            inputMode="numeric"
            autoFocus
            placeholder="$0"
            value={monto}
            onChange={(e) => setMonto(e.target.value.replace(/[^0-9]/g, ""))}
            className="w-full rounded-lg border border-slate-300 px-3 py-3 text-center text-2xl font-semibold"
          />
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="Comentario (opcional)"
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={confirmar}
              disabled={guardando || !monto}
              className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {guardando ? "Guardando..." : "Confirmar"}
            </button>
            <button type="button" onClick={limpiarForm} className="rounded-lg bg-slate-100 px-3 py-2 text-sm">
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-2 text-sm font-medium text-slate-500">Historial</h2>
        <div className="space-y-1">
          {historial.map((h) => {
            const nombre = participantes.find((p) => p.id === h.participante_id)?.nombre ?? "?";
            return (
              <div key={h.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-slate-200">
                <div>
                  <span className="font-medium text-slate-700">{nombre}</span>
                  <span className="ml-2 text-xs text-slate-400">{h.tipo.toLowerCase()}</span>
                  <p className="text-xs text-slate-400">{new Date(h.fecha + "T00:00:00").toLocaleDateString("es-CL")}</p>
                </div>
                <span className={h.monto < 0 ? "text-orange-600" : "text-emerald-600"}>{formatoPesos(h.monto)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {mensaje && (
        <p className="fixed inset-x-0 bottom-20 mx-auto w-fit rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
          {mensaje}
        </p>
      )}
    </div>
  );
}
