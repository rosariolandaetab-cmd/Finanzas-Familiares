"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", etiqueta: "Registrar" },
  { href: "/mes", etiqueta: "Mes" },
  { href: "/presupuesto", etiqueta: "Presupuesto" },
  { href: "/historial", etiqueta: "Historial" },
  { href: "/analisis", etiqueta: "Analisis" },
  { href: "/inversion", etiqueta: "Inversion" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-md">
        {ITEMS.map((item) => {
          const activo = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 py-2.5 text-center text-[11px] font-medium ${
                activo ? "text-blue-600" : "text-slate-400"
              }`}
            >
              {item.etiqueta}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
