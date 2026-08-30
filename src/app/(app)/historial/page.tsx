"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { formatoPesos, periodoActual } from "@/lib/formato";
import { SelectorPeriodo } from "@/components/SelectorPeriodo";
import type { Categoria, Cuenta, EstadoMov, Persona, VMovimiento } from "@/types/database";

function etiquetaCuenta(c: Cuenta) {
  if (c.tipo === "TARJETA_CREDITO") return `${c.banco ?? c.nombre} •${c.ultimos4 ?? ""}`;
  return c.nombre;
}

export default function HistorialPage() {
  const [todosLosMeses, setTodosLosMeses] = useState(false);
  const [periodo, setPeriodo] = useState(periodoActual());
  const [categoriaId, setCategoriaId] = useState<number | "">("");
  const [personaId, setPersonaId] = useState<number | "">("");
  const [cuentaId, setCuentaId] = useState<number | "">("");
  const [estado, setEstado] = useState<EstadoMov | "">("");

  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [movimientos, setMovimientos] = useState<VMovimiento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [editandoId, setEditandoId] = useState<string | null>(null);

  useEffect(() => {
    // sin filtrar por activa: en el historial hay movimientos viejos con
    // categorias que ya no se pueden elegir en Registrar, pero deben poder
    // seguir viendose y editandose aqui.
    supabase
      .from("categorias")
      .select("*")
      .order("orden")
      .then(({ data }) => setCategorias(data ?? []));
    supabase
      .from("personas")
      .select("*")
      .eq("activa", true)
      .then(({ data }) => setPersonas(data ?? []));
    supabase
      .from("cuentas")
      .select("*")
      .eq("activa", true)
      .then(({ data }) => setCuentas(data ?? []));
  }, []);

  const cargarMovimientos = useCallback(async () => {
    setCargando(true);
    let query = supabase.from("v_movimientos").select("*").order("fecha_compra", { ascending: false });
    if (!todosLosMeses) query = query.eq("periodo_devengado", periodo);
    if (categoriaId !== "") query = query.eq("categoria_id", categoriaId);
    if (personaId !== "") query = query.eq("persona_id", personaId);
    if (cuentaId !== "") query = query.eq("cuenta_id", cuentaId);
    if (estado !== "") query = query.eq("estado", estado);
    const { data } = await query.limit(200);
    setMovimientos(data ?? []);
    setCargando(false);
  }, [todosLosMeses, periodo, categoriaId, personaId, cuentaId, estado]);

  useEffect(() => {
    cargarMovimientos();
  }, [cargarMovimientos]);

  async function borrar(id: string) {
    if (!confirm("¿Borrar este movimiento? No se puede deshacer.")) return;
    await supabase.from("movimientos").delete().eq("id", id);
    setEditandoId(null);
    cargarMovimientos();
  }

  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      <div className="flex items-center justify-between">
        {todosLosMeses ? (
          <span className="text-sm font-medium text-slate-500">Todos los meses</span>
        ) : (
          <SelectorPeriodo periodo={periodo} onChange={setPeriodo} />
        )}
        <button
          type="button"
          onClick={() => setTodosLosMeses((v) => !v)}
          className="text-xs text-blue-600 underline"
        >
          {todosLosMeses ? "Filtrar por mes" : "Ver todos"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <select
          value={categoriaId}
          onChange={(e) => setCategoriaId(e.target.value ? Number(e.target.value) : "")}
          className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
        >
          <option value="">Todas las categorias</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        <select
          value={personaId}
          onChange={(e) => setPersonaId(e.target.value ? Number(e.target.value) : "")}
          className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
        >
          <option value="">Toda persona</option>
          {personas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
        <select
          value={cuentaId}
          onChange={(e) => setCuentaId(e.target.value ? Number(e.target.value) : "")}
          className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
        >
          <option value="">Todo medio de pago</option>
          {cuentas.map((c) => (
            <option key={c.id} value={c.id}>
              {etiquetaCuenta(c)}
            </option>
          ))}
        </select>
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value as EstadoMov | "")}
          className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
        >
          <option value="">Todo estado</option>
          <option value="PAGADO">Pagado</option>
          <option value="PENDIENTE">Pendiente</option>
        </select>
      </div>

      {cargando ? (
        <p className="py-8 text-center text-slate-400">Cargando...</p>
      ) : movimientos.length === 0 ? (
        <p className="py-8 text-center text-slate-400">No hay movimientos con estos filtros.</p>
      ) : (
        <div className="space-y-2">
          {movimientos.map((m) =>
            editandoId === m.id ? (
              <FilaEdicion
                key={m.id}
                movimiento={m}
                categorias={categorias}
                cuentas={cuentas}
                onCancelar={() => setEditandoId(null)}
                onGuardado={() => {
                  setEditandoId(null);
                  cargarMovimientos();
                }}
                onBorrar={() => borrar(m.id)}
              />
            ) : (
              <button
                key={m.id}
                type="button"
                onClick={() => setEditandoId(m.id)}
                className="w-full rounded-xl bg-white p-3 text-left ring-1 ring-slate-200"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{m.categoria}</p>
                    <p className="text-xs text-slate-400">
                      {new Date(m.fecha_compra + "T00:00:00").toLocaleDateString("es-CL")}
                      {m.comentario ? ` · ${m.comentario}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className={`text-sm font-semibold ${
                        m.tipo_flujo === "INGRESO"
                          ? "text-blue-600"
                          : m.tipo_flujo === "TRANSFERENCIA"
                          ? "text-slate-500"
                          : "text-orange-600"
                      }`}
                    >
                      {formatoPesos(m.monto)}
                    </p>
                    {m.estado === "PENDIENTE" && (
                      <span className="text-[10px] font-medium uppercase text-amber-600">Pendiente</span>
                    )}
                  </div>
                </div>
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

function FilaEdicion({
  movimiento,
  categorias,
  cuentas,
  onCancelar,
  onGuardado,
  onBorrar,
}: {
  movimiento: VMovimiento;
  categorias: Categoria[];
  cuentas: Cuenta[];
  onCancelar: () => void;
  onGuardado: () => void;
  onBorrar: () => void;
}) {
  const [monto, setMonto] = useState(String(movimiento.monto));
  const [categoriaId, setCategoriaId] = useState(movimiento.categoria_id);
  const [cuentaId, setCuentaId] = useState(movimiento.cuenta_id);
  const [estado, setEstado] = useState<EstadoMov>(movimiento.estado);
  const [fecha, setFecha] = useState(movimiento.fecha_compra);
  const [comentario, setComentario] = useState(movimiento.comentario ?? "");
  const [guardando, setGuardando] = useState(false);

  const categoriaActual = categorias.find((c) => c.id === movimiento.categoria_id);
  const esDeInversion = ["TR-01", "TR-02", "IN-04"].includes(categoriaActual?.codigo ?? "");

  if (esDeInversion) {
    return (
      <div className="space-y-2 rounded-xl bg-white p-3 ring-2 ring-blue-500">
        <p className="text-sm text-slate-600">
          Este movimiento tiene el detalle de reparto por persona en la pestana Inversion. Para editarlo o borrarlo,
          hazlo desde ahi para que no se desincronice.
        </p>
        <button type="button" onClick={onCancelar} className="rounded-lg bg-slate-100 px-3 py-2 text-sm">
          Cerrar
        </button>
      </div>
    );
  }

  async function guardar() {
    setGuardando(true);
    await supabase
      .from("movimientos")
      .update({
        fecha_compra: fecha,
        fecha_caja: estado === "PAGADO" ? fecha : null,
        categoria_id: categoriaId,
        monto: Number(monto || "0"),
        cuenta_id: cuentaId,
        estado,
        comentario: comentario.trim() || null,
        actualizado_en: new Date().toISOString(),
      })
      .eq("id", movimiento.id);
    setGuardando(false);
    onGuardado();
  }

  return (
    <div className="space-y-2 rounded-xl bg-white p-3 ring-2 ring-blue-500">
      <input
        type="text"
        inputMode="numeric"
        value={monto}
        onChange={(e) => setMonto(e.target.value.replace(/[^0-9-]/g, ""))}
        className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
      />
      <select
        value={categoriaId}
        onChange={(e) => setCategoriaId(Number(e.target.value))}
        className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
      >
        {categorias.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>
      <select
        value={cuentaId}
        onChange={(e) => setCuentaId(Number(e.target.value))}
        className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
      >
        {cuentas.map((c) => (
          <option key={c.id} value={c.id}>
            {etiquetaCuenta(c)}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="flex-1 rounded-lg border border-slate-300 px-2 py-2 text-sm"
        />
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value as EstadoMov)}
          className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
        >
          <option value="PAGADO">Pagado</option>
          <option value="PENDIENTE">Pendiente</option>
        </select>
      </div>
      <input
        type="text"
        placeholder="Comentario"
        value={comentario}
        onChange={(e) => setComentario(e.target.value)}
        className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
      />
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Guardar
        </button>
        <button type="button" onClick={onCancelar} className="rounded-lg bg-slate-100 px-3 py-2 text-sm">
          Cancelar
        </button>
        <button type="button" onClick={onBorrar} className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          Borrar
        </button>
      </div>
    </div>
  );
}
