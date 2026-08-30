-- ============================================================
-- Finanzas Familiares - correccion: ganancia de inversion no es ingreso
-- Ejecutar una vez en Supabase > SQL Editor > New query
-- Requiere haber corrido antes 02_actualizacion_inversion.sql
-- ============================================================

-- La ganancia de inversion nunca sale del fondo, asi que no debe
-- contarse como ingreso de la familia (igual que Aporte y Retiro,
-- que ya son Transferencia). Ningun movimiento historico usa esta
-- categoria todavia, asi que este cambio no altera ningun total
-- de meses pasados.

update categorias
set tipo = 'TRANSFERENCIA', grupo = 'Transferencia', nombre = 'Ganancia inversion'
where codigo = 'IN-04';
