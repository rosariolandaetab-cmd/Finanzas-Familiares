"use client";

import { Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatoPesos } from "@/lib/formato";

type Punto = { etiqueta: string; ahorroRecurrente: number; ahorroNoRecurrente: number };

export function AhorroChart({ datos }: { datos: Punto[] }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={datos} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <XAxis dataKey="etiqueta" tick={{ fontSize: 11, fill: "#8A7A63" }} />
          <YAxis tickFormatter={(v) => `$${Math.round(v / 1000)}k`} tick={{ fontSize: 11, fill: "#B3A588" }} width={48} />
          <Tooltip formatter={(v) => formatoPesos(Number(v))} labelStyle={{ color: "#4A3D2A" }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="ahorroRecurrente" name="Ahorro recurrente" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
          <Line
            type="monotone"
            dataKey="ahorroNoRecurrente"
            name="Ahorro no recurrente"
            stroke="#a855f7"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
