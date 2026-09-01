"use client";

import { useState } from "react";
import { formatoPesos } from "@/lib/formato";
import { CLASES_SEMAFORO, colorSemaforo } from "@/lib/semaforo";

export type FilaDesglose = {
  grupo: string;
  gastado: number;
  tope: number;
};

const ORDEN_GRUPOS = ["Fijos", "Deudas", "Asignacion personal", "Variables", "Otros"];

export function grupoPrincipal(grupo: string): string {
  if (grupo.startsWith("Fijos")) return "Fijos";
  if (grupo === "Deudas") return "Deudas";
  if (grupo === "Asignacion personal") return "Asignacion personal";
  if (grupo.startsWith("Variables")) return "Variables";
  return "Otros";
}

export function DesgloseSegmentado<T extends FilaDesglose>({
  filas,
  renderFila,
  keyDe,
}: {
  filas: T[];
  renderFila: (fila: T) => React.ReactNode;
  keyDe: (fila: T) => string;
}) {
  const [colapsados, setColapsados] = useState<Set<string>>(new Set());

  const grupos = new Map<string, T[]>();
  for (const f of filas) {
    const g = grupoPrincipal(f.grupo);
    if (!grupos.has(g)) grupos.set(g, []);
    grupos.get(g)!.push(f);
  }
  const nombresGrupos = [...grupos.keys()].sort((a, b) => ORDEN_GRUPOS.indexOf(a) - ORDEN_GRUPOS.indexOf(b));

  return (
    <div className="space-y-3">
      {nombresGrupos.map((g) => {
        const items = grupos.get(g)!;
        const totalGastado = items.reduce((a, f) => a + f.gastado, 0);
        const totalTope = items.reduce((a, f) => a + f.tope, 0);
        const color = colorSemaforo(totalGastado, totalTope);
        const pct =
          totalTope > 0 ? Math.min(100, Math.round((totalGastado / totalTope) * 100)) : totalGastado > 0 ? 100 : 0;
        const colapsado = colapsados.has(g);

        return (
          <div key={g} className="space-y-2">
            <button
              type="button"
              onClick={() =>
                setColapsados((prev) => {
                  const next = new Set(prev);
                  if (next.has(g)) next.delete(g);
                  else next.add(g);
                  return next;
                })
              }
              className="w-full rounded-2xl bg-white p-3 text-left ring-1 ring-sand"
            >
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-ink">{g}</span>
                <div className="flex items-center gap-2">
                  <span className="text-taupe">
                    {formatoPesos(totalGastado)}
                    {totalTope > 0 ? ` / ${formatoPesos(totalTope)}` : ""}
                  </span>
                  <span className="text-taupe/70">{colapsado ? "▸" : "▾"}</span>
                </div>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-cream">
                <div className={`h-full ${CLASES_SEMAFORO[color]}`} style={{ width: `${pct}%` }} />
              </div>
            </button>

            {!colapsado && (
              <div className="space-y-2 pl-2">
                {items.map((f) => (
                  <div key={keyDe(f)}>{renderFila(f)}</div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
