# Finanzas Familiares

App para registrar los movimientos de la cuenta familiar. Ver `00_ESPECIFICACION_APP.md` para el
detalle completo.

## Puesta en marcha

1. Copia `.env.example` a `.env.local` y completa las credenciales de tu proyecto Supabase
   (`NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`). No subas `.env.local` al repositorio.
2. Instala dependencias: `npm install`
3. Levanta el servidor de desarrollo: `npm run dev`
4. Abre `http://localhost:3000`

La base de datos (esquema, categorias y movimientos) ya existe en Supabase — este proyecto solo la
lee y escribe, no la modifica.

## Estado actual

Las 5 pantallas principales de la especificacion (secciones 6.1 a 6.5) estan implementadas:
Registrar, Mes, Presupuesto, Historial y Analisis, con navegacion inferior entre ellas.

Automatizaciones (gastos fijos recurrentes, alertas de presupuesto, recordatorio de tarjeta,
importar cartola, lectura de correos del banco) y el cierre de ciclos de tarjeta quedan para
entregas futuras.
