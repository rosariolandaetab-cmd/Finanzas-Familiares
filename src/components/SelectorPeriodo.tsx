"use client";

import { etiquetaPeriodo, sumarMesesAPeriodo } from "@/lib/formato";

export function SelectorPeriodo({
  periodo,
  onChange,
}: {
  periodo: string;
  onChange: (periodo: string) => void;
}) {
  return (
    <div className="flex items-center justify-between px-1">
      <button
        type="button"
        onClick={() => onChange(sumarMesesAPeriodo(periodo, -1))}
        className="rounded-xl px-3 py-1.5 text-lg text-taupe"
        aria-label="Mes anterior"
      >
        ‹
      </button>
      <span className="text-base font-semibold capitalize text-ink">{etiquetaPeriodo(periodo)}</span>
      <button
        type="button"
        onClick={() => onChange(sumarMesesAPeriodo(periodo, 1))}
        className="rounded-xl px-3 py-1.5 text-lg text-taupe"
        aria-label="Mes siguiente"
      >
        ›
      </button>
    </div>
  );
}
