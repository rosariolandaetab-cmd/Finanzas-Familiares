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

Primera entrega: solo la pantalla de **Registrar movimiento** (seccion 6.1 de la especificacion).
Las demas pantallas (Mes, Presupuesto, Historial, Analisis) se implementan en entregas futuras.
