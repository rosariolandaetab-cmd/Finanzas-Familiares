"use client";

import { Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatoPesos } from "@/lib/formato";

type Punto = { periodo: string; etiqueta: string; ingresoRecurrente: number; gastoTotal: number };

export function EvolucionChart({ datos }: { datos: Punto[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={datos} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <XAxis dataKey="etiqueta" tick={{ fontSize: 11, fill: "#64748b" }} />
          <YAxis
            tickFormatter={(v) => `$${Math.round(v / 1000)}k`}
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            width={48}
          />
          <Tooltip formatter={(v) => formatoPesos(Number(v))} labelStyle={{ color: "#0f172a" }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="ingresoRecurrente"
            name="Ingreso recurrente"
            stroke="#2563eb"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey="gastoTotal"
            name="Gasto total"
            stroke="#ea580c"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
