"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { encolarMovimiento, sincronizarPendientes } from "@/lib/offlineQueue";
import { hoyISO, periodoActual } from "@/lib/formato";
import { repartirAporteInversion } from "@/lib/inversion";
import type { Categoria, Cuenta, MovimientoInsert, Persona, TipoFlujo } from "@/types/database";

type MedioPago = "DEBITO" | "CREDITO";

const TIPOS: { valor: TipoFlujo; etiqueta: string }[] = [
  { valor: "GASTO", etiqueta: "Gasto" },
  { valor: "INGRESO", etiqueta: "Ingreso" },
  { valor: "TRANSFERENCIA", etiqueta: "Transferencia" },
];

const CODIGO_APORTE_INVERSION = "TR-01";

function formatoPesos(valor: number) {
  return valor.toLocaleString("es-CL");
}

export function RegistrarForm({ persona }: { persona: Persona | null }) {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const [tipo, setTipo] = useState<TipoFlujo>("GASTO");
  const [montoTexto, setMontoTexto] = useState("");
  const [categoriaId, setCategoriaId] = useState<number | null>(null);
  const [grupoSeleccionado, setGrupoSeleccionado] = useState<string | null>(null);
  const [medioPago, setMedioPago] = useState<MedioPago | null>(null);
  const [tarjetaId, setTarjetaId] = useState<number | null>(null);
  const [estadoCredito, setEstadoCredito] = useState<"PENDIENTE" | "PAGADO">("PENDIENTE");
  const [fecha, setFecha] = useState(hoyISO());
  const [comentario, setComentario] = useState("");

  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [pendientesSync, setPendientesSync] = useState(0);

  useEffect(() => {
    async function cargar() {
      const [{ data: cats, error: errCats }, { data: cts, error: errCts }] = await Promise.all([
        supabase.from("categorias").select("*").eq("activa", true).order("orden", { ascending: true }),
        supabase.from("cuentas").select("*").eq("activa", true),
      ]);
      if (errCats || errCts) {
        setErrorCarga("No se pudieron cargar las categorias o cuentas. Revisa tu conexion.");
      } else {
        setCategorias(cats ?? []);
        setCuentas(cts ?? []);
      }
      setCargando(false);
    }
    cargar();

    async function intentarSync() {
      const { enviados, quedan } = await sincronizarPendientes();
      setPendientesSync(quedan);
      if (enviados > 0) {
        setMensaje(`Se sincronizaron ${enviados} movimiento(s) pendientes`);
        setTimeout(() => setMensaje(null), 2500);
      }
    }
    intentarSync();
    window.addEventListener("online", intentarSync);
    return () => window.removeEventListener("online", intentarSync);
  }, []);

  const categoriasDelTipo = useMemo(
    () => categorias.filter((c) => c.tipo === tipo).sort((a, b) => a.orden - b.orden),
    [categorias, tipo]
  );

  const top6 = categoriasDelTipo.slice(0, 6);

  const grupos = useMemo(() => {
    const vistos = new Set<string>();
    const lista: string[] = [];
    for (const c of categoriasDelTipo) {
      if (!vistos.has(c.grupo)) {
        vistos.add(c.grupo);
        lista.push(c.grupo);
      }
    }
    return lista;
  }, [categoriasDelTipo]);

  const listaVisible = useMemo(() => {
    if (grupoSeleccionado) {
      return categoriasDelTipo.filter((c) => c.grupo === grupoSeleccionado);
    }
    return top6;
  }, [grupoSeleccionado, categoriasDelTipo, top6]);

  const cuentaCorriente = useMemo(() => cuentas.find((c) => c.tipo === "CORRIENTE"), [cuentas]);
  const tarjetas = useMemo(() => cuentas.filter((c) => c.tipo === "TARJETA_CREDITO"), [cuentas]);
  const requiereMedioPago = tipo === "GASTO";

  useEffect(() => {
    if (medioPago === "CREDITO" && tarjetas.length === 1) {
      setTarjetaId(tarjetas[0].id);
    }
  }, [medioPago, tarjetas]);

  useEffect(() => {
    // Ingreso y Transferencia siempre van a la cuenta corriente: no hay
    // nada que elegir, así que no se le pregunta a la persona.
    if (!requiereMedioPago) setMedioPago("DEBITO");
  }, [requiereMedioPago]);

  const montoNumero = Number(montoTexto || "0");

  const cuentaResuelta: Cuenta | undefined = !requiereMedioPago
    ? cuentaCorriente
    : medioPago === "DEBITO"
    ? cuentaCorriente
    : medioPago === "CREDITO"
    ? tarjetas.find((t) => t.id === tarjetaId)
    : undefined;

  const faltaElegirTarjeta = requiereMedioPago && medioPago === "CREDITO" && tarjetas.length > 1 && !tarjetaId;

  const puedeGuardar =
    montoNumero > 0 && categoriaId !== null && !!cuentaResuelta && !faltaElegirTarjeta && !guardando;

  function limpiarFormulario() {
    setTipo("GASTO");
    setMontoTexto("");
    setCategoriaId(null);
    setGrupoSeleccionado(null);
    setMedioPago(null);
    setTarjetaId(null);
    setEstadoCredito("PENDIENTE");
    setFecha(hoyISO());
    setComentario("");
  }

  async function guardar() {
    if (!puedeGuardar || !cuentaResuelta || categoriaId === null) return;
    setGuardando(true);

    const esCredito = requiereMedioPago && medioPago === "CREDITO";
    const estado = esCredito ? estadoCredito : "PAGADO";
    const mov: MovimientoInsert = {
      fecha_compra: fecha,
      fecha_caja: estado === "PAGADO" ? fecha : null,
      categoria_id: categoriaId,
      monto: montoNumero,
      cuenta_id: cuentaResuelta.id,
      estado,
      comentario: comentario.trim() || null,
      origen: "MANUAL",
      creado_por: persona?.id ?? null,
    };

    const { data: insertado, error } = await supabase.from("movimientos").insert(mov).select("id").single();

    if (error && !error.code) {
      // sin "code" = fallo de red (sin señal), no un error del servidor: se guarda para reintentar
      encolarMovimiento(mov);
      setPendientesSync((n) => n + 1);
      setMensaje("Sin conexion: guardado en el telefono, se enviara solo");
      setGuardando(false);
      limpiarFormulario();
      setTimeout(() => setMensaje(null), 2000);
      return;
    }

    if (error) {
      setMensaje("No se pudo guardar. Intenta de nuevo.");
      setGuardando(false);
      setTimeout(() => setMensaje(null), 2500);
      return;
    }

    const categoriaElegida = categorias.find((c) => c.id === categoriaId);
    if (categoriaElegida?.codigo === CODIGO_APORTE_INVERSION && insertado) {
      await repartirAporteInversion({
        movimientoId: insertado.id,
        periodo: periodoActual(),
        monto: montoNumero,
        fecha,
        creadoPor: persona?.id ?? null,
      });
    }

    setMensaje("Guardado ✓");
    setGuardando(false);
    limpiarFormulario();
    setTimeout(() => setMensaje(null), 2000);
  }

  if (cargando) {
    return <div className="flex min-h-dvh items-center justify-center text-slate-400">Cargando...</div>;
  }

  if (errorCarga) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6 text-center text-red-600">
        {errorCarga}
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-dvh max-w-md space-y-6 p-4 pb-10">
      {pendientesSync > 0 && (
        <p className="rounded-lg bg-amber-100 px-3 py-2 text-center text-sm text-amber-800">
          {pendientesSync} movimiento(s) esperando señal para sincronizar
        </p>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-500">Monto</label>
        <input
          type="text"
          inputMode="numeric"
          autoFocus
          placeholder="$0"
          value={montoTexto ? `$${formatoPesos(montoNumero)}` : ""}
          onChange={(e) => setMontoTexto(e.target.value.replace(/[^0-9]/g, ""))}
          className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-5 text-center text-4xl font-semibold tracking-tight"
        />
      </div>

      <div className="flex gap-2">
        {TIPOS.map((t) => (
          <button
            key={t.valor}
            type="button"
            onClick={() => {
              setTipo(t.valor);
              setCategoriaId(null);
              setGrupoSeleccionado(null);
              if (t.valor === "GASTO") {
                setMedioPago(null);
                setTarjetaId(null);
                setEstadoCredito("PENDIENTE");
              }
            }}
            className={`flex-1 rounded-full py-2 text-sm font-medium transition ${
              tipo === t.valor
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-600 ring-1 ring-inset ring-slate-300"
            }`}
          >
            {t.etiqueta}
          </button>
        ))}
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-500">Categoria</label>

        {grupos.length > 1 && (
          <div className="mb-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setGrupoSeleccionado(null)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                grupoSeleccionado === null
                  ? "bg-blue-600 text-white"
                  : "bg-white text-slate-600 ring-1 ring-inset ring-slate-300"
              }`}
            >
              Mas usadas
            </button>
            {grupos.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGrupoSeleccionado(g)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  grupoSeleccionado === g
                    ? "bg-blue-600 text-white"
                    : "bg-white text-slate-600 ring-1 ring-inset ring-slate-300"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          {listaVisible.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategoriaId(c.id)}
              className={`rounded-xl px-3 py-3 text-left text-sm font-medium ${
                categoriaId === c.id
                  ? "bg-blue-600 text-white"
                  : "bg-white text-slate-700 ring-1 ring-inset ring-slate-300"
              }`}
            >
              {c.nombre}
            </button>
          ))}
        </div>
      </div>

      {requiereMedioPago && (
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-500">Medio de pago</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMedioPago("DEBITO")}
              disabled={!cuentaCorriente}
              className={`rounded-xl py-4 text-sm font-semibold disabled:opacity-40 ${
                medioPago === "DEBITO" ? "bg-slate-900 text-white" : "bg-white ring-1 ring-inset ring-slate-300"
              }`}
            >
              Debito
            </button>
            <button
              type="button"
              onClick={() => setMedioPago("CREDITO")}
              disabled={tarjetas.length === 0}
              className={`rounded-xl py-4 text-sm font-semibold disabled:opacity-40 ${
                medioPago === "CREDITO" ? "bg-slate-900 text-white" : "bg-white ring-1 ring-inset ring-slate-300"
              }`}
            >
              Credito
            </button>
          </div>
          {medioPago === "CREDITO" && (
            <>
              {tarjetas.length > 1 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {tarjetas.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTarjetaId(t.id)}
                      className={`rounded-full px-3 py-2 text-sm ${
                        tarjetaId === t.id ? "bg-blue-600 text-white" : "bg-white ring-1 ring-inset ring-slate-300"
                      }`}
                    >
                      {t.banco ?? t.nombre} •{t.ultimos4}
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-2 flex gap-2">
                {(["PENDIENTE", "PAGADO"] as const).map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setEstadoCredito(e)}
                    className={`flex-1 rounded-lg py-2 text-xs font-medium ${
                      estadoCredito === e ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {e === "PENDIENTE" ? "Pendiente (aun no se paga)" : "Ya pagado"}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div className="flex gap-4">
        <div className="flex-1">
          <label className="mb-1 block text-sm font-medium text-slate-500">Fecha</label>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-3 text-base"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-500">Comentario (opcional)</label>
        <input
          type="text"
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          placeholder="Ej: almuerzo con amigos"
          className="w-full rounded-xl border border-slate-300 px-3 py-3 text-base"
        />
      </div>

      <button
        type="button"
        onClick={guardar}
        disabled={!puedeGuardar}
        className="w-full rounded-2xl bg-blue-600 py-4 text-lg font-semibold text-white disabled:opacity-40"
      >
        {guardando ? "Guardando..." : "Guardar"}
      </button>

      {mensaje && (
        <p className="fixed inset-x-0 bottom-4 mx-auto w-fit rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
          {mensaje}
        </p>
      )}
    </div>
  );
}
