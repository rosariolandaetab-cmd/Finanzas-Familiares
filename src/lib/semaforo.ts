export type ColorSemaforo = "verde" | "ambar" | "rojo";

export function colorSemaforo(gastado: number, tope: number): ColorSemaforo {
  if (tope <= 0) return gastado > 0 ? "rojo" : "verde";
  const pct = gastado / tope;
  if (pct >= 1) return "rojo";
  if (pct >= 0.8) return "ambar";
  return "verde";
}

export const CLASES_SEMAFORO: Record<ColorSemaforo, string> = {
  verde: "bg-emerald-500",
  ambar: "bg-amber-500",
  rojo: "bg-red-500",
};

export const CLASES_SEMAFORO_TEXTO: Record<ColorSemaforo, string> = {
  verde: "text-emerald-600",
  ambar: "text-amber-600",
  rojo: "text-red-600",
};
