# Finanzas Familiares

App para registrar los movimientos de la cuenta familiar. Ver `00_ESPECIFICACION_APP.md` para el
detalle completo.

## Puesta en marcha

1. **Corre `02_actualizacion_inversion.sql` una vez en Supabase (SQL Editor)** si todavia no lo
   corriste: agrupa categorias de gasto, desactiva algunas, agrega la seccion Inversion y marca
   que categorias se pueden presupuestar. No borra ni modifica movimientos existentes.
2. Copia `.env.example` a `.env.local` y completa las credenciales de tu proyecto Supabase
   (`NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`). No subas `.env.local` al repositorio.
3. Instala dependencias: `npm install`
4. Levanta el servidor de desarrollo: `npm run dev`
5. Abre `http://localhost:3000`

La base de datos (esquema, categorias y movimientos) ya existe en Supabase — este proyecto solo la
lee y escribe. Los cambios de estructura (como `02_actualizacion_inversion.sql`) se entregan como
script para correr manualmente, nunca se ejecutan automaticamente desde la app.

## Estado actual

Las 6 pantallas principales estan implementadas: Registrar, Mes, Presupuesto, Historial, Analisis
e Inversion, con navegacion inferior entre ellas.

**Inversion** guarda el saldo de Rocha, Lalo y "Bajo Lalo", y reparte automaticamente:
- Aportes (desde Registrar → Transferencia → Aporte a inversion): segun los sueldos del mes.
- Ganancias: segun cuanto tiene cada uno hoy.
- Retiros (solo Rocha y Lalo por ahora): segun cuanto tiene cada uno de esos dos.

El saldo inicial de cada participante se carga una vez a mano (no se reconstruye el historial
completo de antes de usar la app).

Automatizaciones (gastos fijos recurrentes, alertas de presupuesto, recordatorio de tarjeta,
importar cartola, lectura de correos del banco) y el cierre de ciclos de tarjeta quedan para
entregas futuras.
