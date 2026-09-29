"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { hoyISO } from "@/lib/formato";
import { cargarCatalogoPersonal } from "@/lib/personal";
import type { CategoriaPersonal, CuentaPersonal, MovimientoPersonalInsert } from "@/types/database";

type Tipo = "GASTO" | "INGRESO";

export default function RegistrarPersonalPage() {
  const [cuentas, setCuentas] = useState<CuentaPersonal[]>([]);
  const [categorias, setCategorias] = useState<CategoriaPersonal[]>([]);
  const [cargando, setCargando] = useState(true);

  const [tipo, setTipo] = useState<Tipo>("GASTO");
  const [montoTexto, setMontoTexto] = useState("");
  const [categoriaId, setCategoriaId] = useState<number | null>(null);
  const [cuentaId, setCuentaId] = useState<number | null>(null);
  const [yaPagado, setYaPagado] = useState(false);
  const [fecha, setFecha] = useState(hoyISO());
  const [comentario, setComentario] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    cargarCatalogoPersonal().then(({ cuentas, categorias }) => {
      setCuentas(cuentas);
      setCategorias(categorias);
      setCargando(false);
    });
  }, []);

  const categoriasDelTipo = useMemo(
    () => categorias.filter((c) => c.activa && c.tipo === tipo),
    [categorias, tipo]
  );
  const cuenta = cuentas.find((c) => c.id === cuentaId);
  const esCredito = tipo === "GASTO" && cuenta?.tipo === "CREDITO";
  const montoNumero = Number(montoTexto || "0");
  const puedeGuardar = montoNumero > 0 && !!categoriaId && (tipo === "INGRESO" || !!cuentaId) && !guardando;

  function limpiar() {
    setMontoTexto("");
    setCategoriaId(null);
    setCuentaId(null);
    setYaPagado(false);
    setFecha(hoyISO());
    setComentario("");
  }

  async function guardar() {
    if (!puedeGuardar || !categoriaId) return;
    setGuardando(true);
    const pendiente = esCredito && !yaPagado;
    const mov: MovimientoPersonalInsert = {
      fecha,
      categoria_id: categoriaId,
      cuenta_id: tipo === "GASTO" ? cuentaId : null,
      monto: montoNumero,
      estado: pendiente ? "PENDIENTE" : "PAGADO",
      fecha_pago: pendiente ? null : fecha,
      comentario: comentario.trim() || null,
    };
    const { error } = await supabase.from("personal_movimientos").insert(mov);
    setGuardando(false);
    if (error) {
      setMensaje(error.code ? "No se pudo guardar. Intenta de nuevo." : "Sin conexion. Intenta cuando tengas señal.");
      setTimeout(() => setMensaje(null), 2500);
      return;
    }
    setMensaje("Guardado ✓");
    setTimeout(() => setMensaje(null), 2000);
    limpiar();
  }

  if (cargando) {
    return <div className="flex min-h-[60dvh] items-center justify-center text-taupe/70">Cargando...</div>;
  }

  if (cuentas.length === 0) {
    return (
      <p className="mx-auto max-w-md p-6 text-center text-sm text-taupe">
        No tienes cuentas personales configuradas todavia.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-clay">Mis cuentas</p>

      <input
        type="text"
        inputMode="numeric"
        autoFocus
        placeholder="$0"
        value={montoTexto ? `$${montoNumero.toLocaleString("es-CL")}` : ""}
        onChange={(e) => setMontoTexto(e.target.value.replace(/[^0-9]/g, ""))}
        className="w-full rounded-2xl border border-sand bg-white px-4 py-5 text-center text-4xl font-semibold tracking-tight"
      />

      <div className="flex gap-2">
        {(["GASTO", "INGRESO"] as Tipo[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTipo(t);
              setCategoriaId(null);
            }}
            className={`flex-1 rounded-full py-2 text-sm font-medium ${
              tipo === t ? "bg-ink text-white" : "bg-white text-ink/70 ring-1 ring-inset ring-sand"
            }`}
          >
            {t === "GASTO" ? "Gasto" : "Ingreso"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {categoriasDelTipo.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategoriaId(c.id)}
            className={`rounded-2xl px-3 py-3 text-left text-sm font-medium ${
              categoriaId === c.id ? "bg-clay text-white" : "bg-white text-ink ring-1 ring-inset ring-sand"
            }`}
          >
            {c.nombre}
          </button>
        ))}
      </div>

      {tipo === "GASTO" && (
        <div>
          <label className="mb-2 block text-sm font-medium text-taupe">Medio de pago</label>
          <div className="grid grid-cols-3 gap-2">
            {cuentas.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCuentaId(c.id)}
                className={`rounded-2xl px-2 py-4 text-sm font-semibold ${
                  cuentaId === c.id ? "bg-ink text-white" : "bg-white ring-1 ring-inset ring-sand"
                }`}
              >
                {c.tipo === "CREDITO" ? "Credito" : c.nombre}
              </button>
            ))}
          </div>
          {esCredito && cuenta && (
            <div className="mt-2 flex gap-2">
              {[false, true].map((pagado) => (
                <button
                  key={String(pagado)}
                  type="button"
                  onClick={() => setYaPagado(pagado)}
                  className={`flex-1 rounded-xl py-2 text-xs font-medium ${
                    yaPagado === pagado ? "bg-clay text-white" : "bg-cream text-ink/70"
                  }`}
                >
                  {pagado ? "Ya pagado" : "Pendiente (aun no se paga)"}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <input
        type="date"
        value={fecha}
        onChange={(e) => setFecha(e.target.value)}
        className="w-full rounded-2xl border border-sand px-3 py-3 text-base"
      />
      <input
        type="text"
        value={comentario}
        onChange={(e) => setComentario(e.target.value)}
        placeholder="Comentario (opcional)"
        className="w-full rounded-2xl border border-sand px-3 py-3 text-base"
      />

      <button
        type="button"
        onClick={guardar}
        disabled={!puedeGuardar}
        className="w-full rounded-2xl bg-clay py-4 text-lg font-semibold text-white disabled:opacity-40"
      >
        {guardando ? "Guardando..." : "Guardar"}
      </button>

      {mensaje && (
        <p className="fixed inset-x-0 bottom-24 mx-auto w-fit rounded-full bg-ink px-4 py-2 text-sm text-white shadow-lg">
          {mensaje}
        </p>
      )}
    </div>
  );
}
