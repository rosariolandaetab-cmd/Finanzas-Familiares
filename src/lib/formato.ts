export function formatoPesos(valor: number) {
  const signo = valor < 0 ? "-" : "";
  return `${signo}$${Math.abs(Math.round(valor)).toLocaleString("es-CL")}`;
}

export function hoyISO() {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

export function periodoActual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function sumarMesesAPeriodo(periodo: string, delta: number) {
  const [anio, mes] = periodo.split("-").map(Number);
  const d = new Date(anio, mes - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const NOMBRES_MES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

export function etiquetaPeriodo(periodo: string) {
  const [anio, mes] = periodo.split("-").map(Number);
  return `${NOMBRES_MES[mes - 1]} ${anio}`;
}
