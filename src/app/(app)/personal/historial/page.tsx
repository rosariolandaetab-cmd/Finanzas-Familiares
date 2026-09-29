"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { formatoPesos, periodoActual, sumarMesesAPeriodo } from "@/lib/formato";
import { cargarCatalogoPersonal, etiquetaCuentaPersonal } from "@/lib/personal";
import { SelectorPeriodo } from "@/components/SelectorPeriodo";
import type { CategoriaPersonal, CuentaPersonal, EstadoMov, MovimientoPersonal } from "@/types/database";

export default function HistorialPersonalPage() {
  return (
    <Suspense fallback={<p className="py-8 text-center text-taupe/70">Cargando...</p>}>
      <HistorialPersonal />
    </Suspense>
  );
}

function HistorialPersonal() {
  // se abre filtrado desde Mes: /personal/historial?estado=PENDIENTE&cuenta=3
  const params = useSearchParams();
  const estadoInicial = params.get("estado") === "PENDIENTE" ? "PENDIENTE" : "";
  const cuentaInicial = params.get("cuenta") ? Number(params.get("cuenta")) : "";

  const [todosLosMeses, setTodosLosMeses] = useState(estadoInicial === "PENDIENTE");
  const [periodo, setPeriodo] = useState(periodoActual());
  const [estado, setEstado] = useState<EstadoMov | "">(estadoInicial);
  const [cuentaFiltro, setCuentaFiltro] = useState<number | "">(cuentaInicial);
  const [cuentas, setCuentas] = useState<CuentaPersonal[]>([]);
  const [categorias, setCategorias] = useState<CategoriaPersonal[]>([]);
  const [movimientos, setMovimientos] = useState<MovimientoPersonal[]>([]);
  const [cargando, setCargando] = useState(true);
  const [editandoId, setEditandoId] = useState<string | null>(null);

  useEffect(() => {
    cargarCatalogoPersonal().then(({ cuentas, categorias }) => {
      setCuentas(cuentas);
      setCategorias(categorias);
    });
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    let query = supabase.from("personal_movimientos").select("*").order("fecha", { ascending: false });
    if (!todosLosMeses) query = query.gte("fecha", `${periodo}-01`).lt("fecha", `${sumarMesesAPeriodo(periodo, 1)}-01`);
    if (estado !== "") query = query.eq("estado", estado);
    if (cuentaFiltro !== "") query = query.eq("cuenta_id", cuentaFiltro);
    const { data } = await query.limit(300);
    setMovimientos(data ?? []);
    setCargando(false);
  }, [todosLosMeses, periodo, estado, cuentaFiltro]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const categoria = (id: number) => categorias.find((c) => c.id === id);
  const hayFiltros = estado !== "" || cuentaFiltro !== "";
  const total = movimientos.reduce((a, m) => a + (categoria(m.categoria_id)?.tipo === "INGRESO" ? 0 : m.monto), 0);

  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-clay">Mis cuentas</p>
      <div className="flex items-center justify-between">
        {todosLosMeses ? (
          <span className="text-sm font-medium text-taupe">Todos los meses</span>
        ) : (
          <SelectorPeriodo periodo={periodo} onChange={setPeriodo} />
        )}
        <button type="button" onClick={() => setTodosLosMeses((v) => !v)} className="text-xs text-clay underline">
          {todosLosMeses ? "Filtrar por mes" : "Ver todos"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value as EstadoMov | "")}
          className="rounded-xl border border-sand px-2 py-2 text-sm"
        >
          <option value="">Todo estado</option>
          <option value="PAGADO">Pagado</option>
          <option value="PENDIENTE">Pendiente</option>
        </select>
        <select
          value={cuentaFiltro}
          onChange={(e) => setCuentaFiltro(e.target.value ? Number(e.target.value) : "")}
          className="rounded-xl border border-sand px-2 py-2 text-sm"
        >
          <option value="">Todo medio de pago</option>
          {cuentas.map((c) => (
            <option key={c.id} value={c.id}>
              {etiquetaCuentaPersonal(c)}
            </option>
          ))}
        </select>
      </div>

      {hayFiltros && !cargando && movimientos.length > 0 && (
        <div className="flex items-center justify-between rounded-2xl bg-ink px-4 py-2 text-sm text-white">
          <span>
            {movimientos.length} movimiento{movimientos.length === 1 ? "" : "s"}
          </span>
          <span className="font-semibold">{formatoPesos(total)}</span>
        </div>
      )}

      {cargando ? (
        <p className="py-8 text-center text-taupe/70">Cargando...</p>
      ) : movimientos.length === 0 ? (
        <p className="py-8 text-center text-taupe/70">No hay movimientos con estos filtros.</p>
      ) : (
        <div className="space-y-2 pb-16">
          {movimientos.map((m) =>
            editandoId === m.id ? (
              <FilaEdicion
                key={m.id}
                movimiento={m}
                cuentas={cuentas}
                categorias={categorias}
                onCerrar={() => setEditandoId(null)}
                onGuardado={() => {
                  setEditandoId(null);
                  cargar();
                }}
              />
            ) : (
              <button
                key={m.id}
                type="button"
                onClick={() => setEditandoId(m.id)}
                className="w-full rounded-2xl bg-white p-3 text-left ring-1 ring-sand"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-ink">{categoria(m.categoria_id)?.nombre ?? "?"}</p>
                    <p className="text-xs text-taupe/70">
                      {new Date(m.fecha + "T00:00:00").toLocaleDateString("es-CL")}
                      {m.cuenta_id ? ` · ${cuentas.find((c) => c.id === m.cuenta_id)?.nombre ?? ""}` : ""}
                      {m.comentario ? ` · ${m.comentario}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className={`text-sm font-semibold ${
                        categoria(m.categoria_id)?.tipo === "INGRESO" ? "text-clay" : "text-orange-600"
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
  cuentas,
  categorias,
  onCerrar,
  onGuardado,
}: {
  movimiento: MovimientoPersonal;
  cuentas: CuentaPersonal[];
  categorias: CategoriaPersonal[];
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [monto, setMonto] = useState(String(movimiento.monto));
  const [categoriaId, setCategoriaId] = useState(movimiento.categoria_id);
  const [cuentaId, setCuentaId] = useState<number | null>(movimiento.cuenta_id);
  const [fecha, setFecha] = useState(movimiento.fecha);
  const [estado, setEstado] = useState<EstadoMov>(movimiento.estado);
  const [comentario, setComentario] = useState(movimiento.comentario ?? "");
  const [guardando, setGuardando] = useState(false);

  if (movimiento.movimiento_familiar_id) {
    return (
      <div className="space-y-2 rounded-2xl bg-white p-3 ring-2 ring-clay">
        <p className="text-sm text-ink/70">
          Esta asignacion viene de la cuenta familiar. Si hay que corregirla, editala en el Historial familiar y se
          actualiza sola aqui.
        </p>
        <button type="button" onClick={onCerrar} className="rounded-xl bg-cream px-3 py-2 text-sm">
          Cerrar
        </button>
      </div>
    );
  }

  const tipo = categorias.find((c) => c.id === categoriaId)?.tipo ?? "GASTO";

  async function guardar() {
    setGuardando(true);
    await supabase
      .from("personal_movimientos")
      .update({
        monto: Number(monto || "0"),
        categoria_id: categoriaId,
        cuenta_id: tipo === "GASTO" ? cuentaId : null,
        fecha,
        estado,
        fecha_pago: estado === "PAGADO" ? movimiento.fecha_pago ?? fecha : null,
        comentario: comentario.trim() || null,
        actualizado_en: new Date().toISOString(),
      })
      .eq("id", movimiento.id);
    setGuardando(false);
    onGuardado();
  }

  async function borrar() {
    if (!confirm("¿Borrar este movimiento? No se puede deshacer.")) return;
    await supabase.from("personal_movimientos").delete().eq("id", movimiento.id);
    onGuardado();
  }

  const clase = "w-full rounded-xl border border-sand px-2 py-2 text-sm";
  return (
    <div className="space-y-2 rounded-2xl bg-white p-3 ring-2 ring-clay">
      <input type="text" inputMode="numeric" value={monto} onChange={(e) => setMonto(e.target.value.replace(/[^0-9-]/g, ""))} className={clase} />
      <select value={categoriaId} onChange={(e) => setCategoriaId(Number(e.target.value))} className={clase}>
        {categorias.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre} ({c.tipo === "GASTO" ? "gasto" : "ingreso"})
          </option>
        ))}
      </select>
      {tipo === "GASTO" && (
        <select value={cuentaId ?? ""} onChange={(e) => setCuentaId(e.target.value ? Number(e.target.value) : null)} className={clase}>
          {cuentas.map((c) => (
            <option key={c.id} value={c.id}>
              {etiquetaCuentaPersonal(c)}
            </option>
          ))}
        </select>
      )}
      <div className="flex gap-2">
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="flex-1 rounded-xl border border-sand px-2 py-2 text-sm" />
        <select value={estado} onChange={(e) => setEstado(e.target.value as EstadoMov)} className="rounded-xl border border-sand px-2 py-2 text-sm">
          <option value="PAGADO">Pagado</option>
          <option value="PENDIENTE">Pendiente</option>
        </select>
      </div>
      <input type="text" placeholder="Comentario" value={comentario} onChange={(e) => setComentario(e.target.value)} className={clase} />
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={guardar} disabled={guardando} className="flex-1 rounded-xl bg-clay py-2 text-sm font-medium text-white disabled:opacity-50">
          Guardar
        </button>
        <button type="button" onClick={onCerrar} className="rounded-xl bg-cream px-3 py-2 text-sm">
          Cancelar
        </button>
        <button type="button" onClick={borrar} className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
          Borrar
        </button>
      </div>
    </div>
  );
}
