"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatoPesos } from "@/lib/formato";

type Paso = {
  nombre: string;
  delta: number;
  tipo: "ingreso" | "salida" | "resultado";
};

const COLORES: Record<Paso["tipo"], string> = {
  ingreso: "#2563eb",
  salida: "#ea580c",
  resultado: "#8A7A63",
};

export function WaterfallChart({ pasos }: { pasos: Paso[] }) {
  let corrida = 0;
  const datos = pasos.map((paso) => {
    if (paso.tipo === "resultado") {
      const base = Math.min(0, paso.delta);
      const valor = Math.abs(paso.delta);
      return { nombre: paso.nombre, base, valor, real: paso.delta, color: COLORES.resultado };
    }
    const inicio = corrida;
    const fin = corrida + paso.delta;
    corrida = fin;
    const base = Math.min(inicio, fin);
    const valor = Math.abs(fin - inicio);
    return { nombre: paso.nombre, base, valor, real: paso.delta, color: COLORES[paso.tipo] };
  });

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} margin={{ top: 8, right: 8, left: 8, bottom: 40 }}>
          <XAxis
            dataKey="nombre"
            interval={0}
            angle={-35}
            textAnchor="end"
            height={60}
            tick={{ fontSize: 11, fill: "#8A7A63" }}
          />
          <YAxis
            tickFormatter={(v) => `$${Math.round(v / 1000)}k`}
            tick={{ fontSize: 11, fill: "#B3A588" }}
            width={48}
          />
          <Tooltip
            formatter={(_valor, _clave, item) => {
              const real = (item?.payload as { real?: number } | undefined)?.real ?? 0;
              return [formatoPesos(real), "Monto"];
            }}
            labelStyle={{ color: "#4A3D2A" }}
          />
          <Bar dataKey="base" stackId="a" fill="transparent" isAnimationActive={false} />
          <Bar dataKey="valor" stackId="a" radius={[4, 4, 4, 4]} isAnimationActive={false}>
            {datos.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
