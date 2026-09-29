"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { formatoPesos, hoyISO, periodoActual, sumarMesesAPeriodo } from "@/lib/formato";
import { cargarCatalogoPersonal, etiquetaCuentaPersonal, proximoVencimiento } from "@/lib/personal";
import { SelectorPeriodo } from "@/components/SelectorPeriodo";
import type { CategoriaPersonal, CuentaPersonal, MovimientoPersonal } from "@/types/database";

export default function MesPersonalPage() {
  const [periodo, setPeriodo] = useState(periodoActual());
  const [cuentas, setCuentas] = useState<CuentaPersonal[]>([]);
  const [categorias, setCategorias] = useState<CategoriaPersonal[]>([]);
  const [movsMes, setMovsMes] = useState<MovimientoPersonal[]>([]);
  const [pendientes, setPendientes] = useState<MovimientoPersonal[]>([]);
  const [cargando, setCargando] = useState(true);
  const [categoriaAbierta, setCategoriaAbierta] = useState<number | null>(null);
  const [editandoTarjeta, setEditandoTarjeta] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const [catalogo, { data: mes }, { data: pend }] = await Promise.all([
      cargarCatalogoPersonal(),
      supabase
        .from("personal_movimientos")
        .select("*")
        .gte("fecha", `${periodo}-01`)
        .lt("fecha", `${sumarMesesAPeriodo(periodo, 1)}-01`)
        .order("fecha", { ascending: false }),
      // la deuda de tarjeta es de hoy, no depende del mes que se mira
      supabase.from("personal_movimientos").select("*").eq("estado", "PENDIENTE"),
    ]);
    setCuentas(catalogo.cuentas);
    setCategorias(catalogo.categorias);
    setMovsMes(mes ?? []);
    setPendientes(pend ?? []);
    setCargando(false);
  }, [periodo]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const tipoCategoria = useMemo(() => new Map(categorias.map((c) => [c.id, c.tipo])), [categorias]);
  const ingresos = movsMes.filter((m) => tipoCategoria.get(m.categoria_id) === "INGRESO");
  const gastos = movsMes.filter((m) => tipoCategoria.get(m.categoria_id) === "GASTO");
  const totalIngresos = ingresos.reduce((a, m) => a + m.monto, 0);
  const totalGastos = gastos.reduce((a, m) => a + m.monto, 0);

  const gastoPorCategoria = useMemo(() => {
    const mapa = new Map<number, number>();
    for (const m of gastos) mapa.set(m.categoria_id, (mapa.get(m.categoria_id) ?? 0) + m.monto);
    return Array.from(mapa.entries())
      .map(([id, total]) => ({ id, nombre: categorias.find((c) => c.id === id)?.nombre ?? "?", total }))
      .sort((a, b) => b.total - a.total);
  }, [gastos, categorias]);

  async function marcarTarjetaPagada(tarjeta: CuentaPersonal, movs: MovimientoPersonal[], total: number) {
    if (!confirm(`¿Pagaste ${formatoPesos(total)} de ${tarjeta.nombre}? Las ${movs.length} compras pendientes quedan pagadas hoy.`)) return;
    await supabase
      .from("personal_movimientos")
      .update({ estado: "PAGADO", fecha_pago: hoyISO(), actualizado_en: new Date().toISOString() })
      .in("id", movs.map((m) => m.id));
    cargar();
  }

  if (cargando) {
    return <div className="flex min-h-[60dvh] items-center justify-center text-taupe/70">Cargando...</div>;
  }

  const tarjetas = cuentas.filter((c) => c.tipo === "CREDITO");

  return (
    <div className="mx-auto max-w-md space-y-6 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-clay">Mis cuentas</p>
      <SelectorPeriodo periodo={periodo} onChange={setPeriodo} />

      {tarjetas.map((t) => {
        const movs = pendientes.filter((m) => m.cuenta_id === t.id);
        const total = movs.reduce((a, m) => a + m.monto, 0);
        const vence = proximoVencimiento(t.dia_vencimiento);
        return (
          <div key={t.id} className="rounded-2xl bg-ink p-4 text-white">
            <p className="text-xs uppercase tracking-wide text-taupe/50">Pendiente de pago · {etiquetaCuentaPersonal(t)}</p>
            <Link href={`/personal/historial?estado=PENDIENTE&cuenta=${t.id}`} className="mt-1 flex items-end justify-between">
              <span className="text-2xl font-semibold">{formatoPesos(total)}</span>
              <span className="text-right text-[11px] text-taupe/70">
                {movs.length} compra{movs.length === 1 ? "" : "s"} · ver detalle ›
                {vence && <span className="block">vence el {vence}</span>}
              </span>
            </Link>
            <div className="mt-3 flex items-center justify-between text-xs">
              <button type="button" onClick={() => setEditandoTarjeta(editandoTarjeta === t.id ? null : t.id)} className="text-white/60 underline">
                Datos de la tarjeta
              </button>
              {movs.length > 0 && (
                <button
                  type="button"
                  onClick={() => marcarTarjetaPagada(t, movs, total)}
                  className="rounded-full bg-white px-3 py-1.5 font-medium text-ink"
                >
                  Pague la tarjeta
                </button>
              )}
            </div>
            {editandoTarjeta === t.id && (
              <EditorTarjeta
                tarjeta={t}
                onGuardado={() => {
                  setEditandoTarjeta(null);
                  cargar();
                }}
              />
            )}
          </div>
        );
      })}

      <div className="grid grid-cols-3 gap-2">
        <Indicador etiqueta="Ingresos" valor={totalIngresos} />
        <Indicador etiqueta="Gastos" valor={totalGastos} />
        <Indicador etiqueta="Me queda" valor={totalIngresos - totalGastos} marcarNegativo />
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium text-taupe">Gastos por categoria</h2>
        {gastoPorCategoria.length === 0 ? (
          <p className="text-sm text-taupe/70">Sin gastos este mes.</p>
        ) : (
          <div className="space-y-2">
            {gastoPorCategoria.map((c) => {
              const abierta = categoriaAbierta === c.id;
              const pct = totalGastos > 0 ? Math.round((c.total / totalGastos) * 100) : 0;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoriaAbierta(abierta ? null : c.id)}
                  className="w-full rounded-2xl bg-white p-3 text-left ring-1 ring-sand"
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-ink">{c.nombre}</span>
                    <span className="text-taupe">
                      {formatoPesos(c.total)} · {pct}%
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-cream">
                    <div className="h-full bg-clay" style={{ width: `${pct}%` }} />
                  </div>
                  {abierta && (
                    <div className="mt-3 space-y-1.5 border-t border-sand/60 pt-2">
                      {gastos
                        .filter((m) => m.categoria_id === c.id)
                        .map((m) => (
                          <div key={m.id} className="flex items-center justify-between text-xs">
                            <span className="text-taupe">
                              {new Date(m.fecha + "T00:00:00").toLocaleDateString("es-CL")}
                              {m.comentario ? ` · ${m.comentario}` : ""}
                              {m.estado === "PENDIENTE" ? " · pendiente" : ""}
                            </span>
                            <span className="font-medium text-ink">{formatoPesos(m.monto)}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Indicador({ etiqueta, valor, marcarNegativo }: { etiqueta: string; valor: number; marcarNegativo?: boolean }) {
  return (
    <div className="rounded-2xl bg-white p-3 ring-1 ring-sand">
      <p className="text-[11px] text-taupe">{etiqueta}</p>
      <p className={`mt-1 text-base font-semibold ${marcarNegativo && valor < 0 ? "text-red-600" : "text-ink"}`}>
        {formatoPesos(valor)}
      </p>
    </div>
  );
}

function EditorTarjeta({ tarjeta, onGuardado }: { tarjeta: CuentaPersonal; onGuardado: () => void }) {
  const [ultimos4, setUltimos4] = useState(tarjeta.ultimos4 ?? "");
  const [facturacion, setFacturacion] = useState(tarjeta.dia_facturacion ? String(tarjeta.dia_facturacion) : "");
  const [vencimiento, setVencimiento] = useState(tarjeta.dia_vencimiento ? String(tarjeta.dia_vencimiento) : "");

  function dia(texto: string) {
    const n = Number(texto);
    return n >= 1 && n <= 31 ? n : null;
  }

  async function guardar() {
    await supabase
      .from("personal_cuentas")
      .update({ ultimos4: ultimos4 || null, dia_facturacion: dia(facturacion), dia_vencimiento: dia(vencimiento) })
      .eq("id", tarjeta.id);
    onGuardado();
  }

  const clase = "w-full rounded-lg px-2 py-1.5 text-sm text-ink";
  return (
    <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-white/70">
      <label>
        Ultimos 4
        <input inputMode="numeric" maxLength={4} value={ultimos4} onChange={(e) => setUltimos4(e.target.value.replace(/\D/g, ""))} className={clase} />
      </label>
      <label>
        Dia facturacion
        <input inputMode="numeric" value={facturacion} onChange={(e) => setFacturacion(e.target.value.replace(/\D/g, ""))} className={clase} />
      </label>
      <label>
        Dia vencimiento
        <input inputMode="numeric" value={vencimiento} onChange={(e) => setVencimiento(e.target.value.replace(/\D/g, ""))} className={clase} />
      </label>
      <button type="button" onClick={guardar} className="col-span-3 rounded-lg bg-clay py-2 text-sm font-medium text-white">
        Guardar
      </button>
    </div>
  );
}
