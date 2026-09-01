"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { formatoPesos, hoyISO } from "@/lib/formato";
import { actualizarSaldoInicialFondo, obtenerSaldosFondos, registrarRetiroFondo } from "@/lib/fondos";
import { supabase } from "@/lib/supabase/client";
import type { MovimientoFondo, VFondoSaldo } from "@/types/database";

export function FondosTab() {
  const { persona } = useAuth();
  const [saldos, setSaldos] = useState<VFondoSaldo[]>([]);
  const [historial, setHistorial] = useState<MovimientoFondo[]>([]);
  const [cargando, setCargando] = useState(true);

  const [retirando, setRetirando] = useState<number | null>(null);
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(hoyISO());
  const [comentario, setComentario] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const [editandoSaldoId, setEditandoSaldoId] = useState<number | null>(null);
  const [saldoInicialTexto, setSaldoInicialTexto] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    const [s, { data: hist }] = await Promise.all([
      obtenerSaldosFondos(),
      supabase.from("fondos_movimientos").select("*").order("fecha", { ascending: false }).limit(300),
    ]);
    setSaldos(s);
    setHistorial(hist ?? []);
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const totalFondos = saldos.reduce((a, s) => a + Math.max(0, s.saldo_actual), 0);

  function limpiarForm() {
    setRetirando(null);
    setMonto("");
    setFecha(hoyISO());
    setComentario("");
  }

  async function confirmarRetiro() {
    const montoNumero = Number(monto || "0");
    if (montoNumero <= 0 || !retirando) return;
    setGuardando(true);
    const { error } = await registrarRetiroFondo({
      fondoId: retirando,
      monto: montoNumero,
      fecha,
      comentario: comentario.trim() || null,
      creadoPor: persona?.id ?? null,
    });
    setGuardando(false);
    if (error) {
      setMensaje(error);
      setTimeout(() => setMensaje(null), 3000);
      return;
    }
    setMensaje("Retiro registrado ✓");
    setTimeout(() => setMensaje(null), 2000);
    limpiarForm();
    cargar();
  }

  async function guardarSaldoInicial(fondoId: number) {
    const valor = Number(saldoInicialTexto.replace(/[^0-9]/g, "") || "0");
    await actualizarSaldoInicialFondo(fondoId, valor);
    setEditandoSaldoId(null);
    cargar();
  }

  if (cargando) {
    return <div className="flex min-h-[40dvh] items-center justify-center text-taupe/70">Cargando...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-ink p-4 text-white">
        <p className="text-xs uppercase tracking-wide text-taupe/50">Total en fondos</p>
        <p className="mt-1 text-2xl font-semibold">{formatoPesos(totalFondos)}</p>
      </div>

      <div className="space-y-2">
        {saldos.map((s) => (
          <div key={s.id} className="rounded-2xl bg-white p-3 ring-1 ring-sand">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink">{s.nombre}</span>
              <span className="text-base font-semibold text-ink">{formatoPesos(s.saldo_actual)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-taupe/70">
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
                    setSaldoInicialTexto("");
                  }}
                  className="underline"
                >
                  Ajustar saldo inicial
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setRetirando(s.id);
                  setMonto("");
                }}
                className="rounded-full bg-cream px-2.5 py-1 font-medium text-ink"
              >
                Retirar
              </button>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-taupe/70">
        Para aportar plata a un fondo, ve a Registrar → Transferencia → Vacaciones / Casa y equipamiento / Fondo de
        reserva. El fondo de reserva es donde puedes asignar lo que sobra de cada mes, una vez que termine.
      </p>

      {retirando && (
        <div className="space-y-2 rounded-2xl bg-white p-3 ring-2 ring-clay">
          <p className="text-sm font-medium text-ink">
            Retirar de {saldos.find((s) => s.id === retirando)?.nombre}
          </p>
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
              onClick={confirmarRetiro}
              disabled={guardando || !monto}
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
            const nombre = saldos.find((s) => s.id === h.fondo_id)?.nombre ?? "?";
            return (
              <div key={h.id} className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-sand">
                <div>
                  <span className="font-medium text-ink">{nombre}</span>
                  <span className="ml-2 text-xs text-taupe/70">{h.tipo.toLowerCase()}</span>
                  <p className="text-xs text-taupe/70">{new Date(h.fecha + "T00:00:00").toLocaleDateString("es-CL")}</p>
                </div>
                <span className={h.tipo === "RETIRO" ? "text-orange-600" : "text-emerald-600"}>
                  {h.tipo === "RETIRO" ? "-" : ""}
                  {formatoPesos(h.monto)}
                </span>
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
