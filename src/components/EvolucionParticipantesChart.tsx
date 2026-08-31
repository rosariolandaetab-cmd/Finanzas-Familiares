"use client";

import { Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatoPesos } from "@/lib/formato";

export type PuntoParticipantes = { etiqueta: string; [nombre: string]: string | number };
export type SerieParticipante = { nombre: string; color: string };

export function EvolucionParticipantesChart({
  datos,
  series,
}: {
  datos: PuntoParticipantes[];
  series: SerieParticipante[];
}) {
  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={datos} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <XAxis dataKey="etiqueta" tick={{ fontSize: 11, fill: "#8A7A63" }} />
          <YAxis tickFormatter={(v) => `$${Math.round(v / 1000000)}M`} tick={{ fontSize: 11, fill: "#B3A588" }} width={40} />
          <Tooltip formatter={(v) => formatoPesos(Number(v))} labelStyle={{ color: "#4A3D2A" }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {series.map((s) => (
            <Line key={s.nombre} type="monotone" dataKey={s.nombre} name={s.nombre} stroke={s.color} strokeWidth={2} dot={{ r: 2 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
