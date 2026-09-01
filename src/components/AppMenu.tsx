"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const ITEMS = [
  { href: "/", etiqueta: "Registrar" },
  { href: "/mes", etiqueta: "Mes" },
  { href: "/presupuesto", etiqueta: "Presupuesto" },
  { href: "/historial", etiqueta: "Historial" },
  { href: "/analisis", etiqueta: "Analisis" },
  { href: "/inversion", etiqueta: "Inversion" },
];

export function AppMenu() {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    setAbierto(false);
  }, [pathname]);

  const actual = ITEMS.find((item) => (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)));

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
        <div className="fixed inset-0 z-40 flex flex-col bg-ink/97 p-6 backdrop-blur">
          <div className="mx-auto flex w-full max-w-md items-center justify-between">
            <span className="text-lg font-semibold text-white">Finanzas Familiares</span>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              aria-label="Cerrar menu"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-xl text-white"
            >
              ✕
            </button>
          </div>

          <div className="mx-auto grid w-full max-w-md flex-1 grid-cols-2 content-center gap-3 py-8">
            {ITEMS.map((item) => {
              const activo = item.href === actual?.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex aspect-square flex-col items-center justify-center rounded-2xl text-center text-base font-semibold ${
                    activo ? "bg-clay text-white" : "bg-white/10 text-white"
                  }`}
                >
                  {item.etiqueta}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
