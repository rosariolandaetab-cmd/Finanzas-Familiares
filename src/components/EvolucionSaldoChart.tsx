"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatoPesos } from "@/lib/formato";

type Punto = { etiqueta: string; saldo: number };

export function EvolucionSaldoChart({ datos }: { datos: Punto[] }) {
  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={datos} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <XAxis dataKey="etiqueta" tick={{ fontSize: 11, fill: "#64748b" }} />
          <YAxis tickFormatter={(v) => `$${Math.round(v / 1000000)}M`} tick={{ fontSize: 11, fill: "#94a3b8" }} width={40} />
          <Tooltip formatter={(v) => [formatoPesos(Number(v)), "Saldo"]} labelStyle={{ color: "#0f172a" }} />
          <Line type="monotone" dataKey="saldo" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
