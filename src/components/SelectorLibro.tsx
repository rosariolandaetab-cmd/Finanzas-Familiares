"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { guardarRegistrarPreferido, tieneCuentasPersonales } from "@/lib/personal";

// Arriba de cada Registrar, para quien tiene cuentas personales: deja claro
// si se esta anotando en la cuenta familiar o en las propias.
export function SelectorLibro({ actual, nombre }: { actual: "familia" | "personal"; nombre: string }) {
  const [visible, setVisible] = useState(actual === "personal");

  useEffect(() => {
    tieneCuentasPersonales().then(setVisible);
  }, []);

  useEffect(() => {
    if (visible) guardarRegistrarPreferido(actual);
  }, [visible, actual]);

  if (!visible) return null;

  const opciones = [
    { valor: "familia", etiqueta: "Familia", href: "/" },
    { valor: "personal", etiqueta: nombre ? `Mis cuentas (${nombre})` : "Mis cuentas", href: "/personal" },
  ] as const;

  return (
    <div className="mx-auto max-w-md px-4 pt-4">
      <p className="mb-1.5 text-xs text-taupe">Estas anotando en:</p>
      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-sand/60 p-1">
        {opciones.map((o) => (
          <Link
            key={o.valor}
            href={o.href}
            replace
            className={`rounded-xl py-2.5 text-center text-sm font-semibold ${
              actual === o.valor ? (o.valor === "personal" ? "bg-clay text-white" : "bg-ink text-white") : "text-ink/60"
            }`}
          >
            {o.etiqueta}
          </Link>
        ))}
      </div>
    </div>
  );
}
