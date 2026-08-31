-- ============================================================
-- Finanzas Familiares - correccion: tercera opcion de presupuesto
-- "usar el gasto real del mes" (sin tener que fijar $ ni %)
--
-- IMPORTANTE: este archivo se corre en DOS pasos separados, cada
-- uno como su propia consulta en Supabase > SQL Editor > New query.
-- Postgres no permite agregar un valor nuevo a un enum y usarlo en
-- la misma ejecucion (error 55P04). Por eso este paso 1 va solo,
-- y el paso 2 esta en el archivo 05_presupuesto_gasto_real_vista.sql.
-- ============================================================

-- ---------- PASO 1 de 2: correr esto primero, solo ----------

alter type tipo_tope add value if not exists 'REAL';
