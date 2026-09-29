"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { tieneCuentasPersonales } from "@/lib/personal";

const ITEMS = [
  { href: "/", etiqueta: "Registrar" },
  { href: "/mes", etiqueta: "Mes" },
  { href: "/presupuesto", etiqueta: "Presupuesto" },
  { href: "/historial", etiqueta: "Historial" },
  { href: "/analisis", etiqueta: "Analisis" },
  { href: "/inversion", etiqueta: "Inversion" },
];

const ITEMS_PERSONALES = [
  { href: "/personal", etiqueta: "Registrar" },
  { href: "/personal/mes", etiqueta: "Mes" },
  { href: "/personal/historial", etiqueta: "Historial" },
];

function esActivo(href: string, pathname: string) {
  if (href === "/" || href === "/personal") return pathname === href;
  return pathname.startsWith(href);
}

export function AppMenu({ nombreUsuario }: { nombreUsuario: string }) {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);
  const [conCuentasPersonales, setConCuentasPersonales] = useState(false);

  useEffect(() => {
    tieneCuentasPersonales().then(setConCuentasPersonales);
  }, []);

  useEffect(() => {
    setAbierto(false);
  }, [pathname]);

  const enPersonal = pathname.startsWith("/personal");

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label="Abrir menu"
        className="fixed bottom-5 right-5 z-30 flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded-full bg-ink text-white shadow-lg"
      >
        <span className="flex gap-0.5">
          <span className="h-1.5 w-1.5 rounded-full bg-white" />
          <span className="h-1.5 w-1.5 rounded-full bg-white" />
        </span>
        <span className="flex gap-0.5">
          <span className="h-1.5 w-1.5 rounded-full bg-white" />
          <span className="h-1.5 w-1.5 rounded-full bg-white" />
        </span>
      </button>

      {abierto && (
        <div className="fixed inset-0 z-40 flex flex-col bg-ink p-6">
          <div className="mx-auto flex w-full max-w-md items-center justify-between">
            <span className="text-lg font-semibold text-white">Finanzas Familiares</span>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              aria-label="Cerrar menu"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-xl text-ink"
            >
              ✕
            </button>
          </div>

          <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 overflow-y-auto py-6">
            <SeccionMenu
              titulo={conCuentasPersonales ? "Familia" : null}
              items={ITEMS}
              pathname={enPersonal ? "" : pathname}
            />
            {conCuentasPersonales && (
              <SeccionMenu titulo={nombreUsuario} items={ITEMS_PERSONALES} pathname={enPersonal ? pathname : ""} />
            )}
          </div>

          <div className="mx-auto flex w-full max-w-md items-center justify-between text-sm text-white/60">
            <span>{nombreUsuario}</span>
            <button
              type="button"
              onClick={() => {
                if (confirm("¿Cerrar sesion?")) supabase.auth.signOut();
              }}
              className="underline"
            >
              Salir
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function SeccionMenu({
  titulo,
  items,
  pathname,
}: {
  titulo: string | null;
  items: { href: string; etiqueta: string }[];
  pathname: string;
}) {
  return (
    <div>
      {titulo && <p className="mb-2 text-xs font-medium uppercase tracking-wide text-white/50">{titulo}</p>}
      <div className="grid grid-cols-3 gap-3">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex aspect-square flex-col items-center justify-center rounded-2xl text-center text-sm font-semibold ${
              esActivo(item.href, pathname) ? "bg-clay text-white" : "bg-white text-ink"
            }`}
          >
            {item.etiqueta}
          </Link>
        ))}
      </div>
    </div>
  );
}
