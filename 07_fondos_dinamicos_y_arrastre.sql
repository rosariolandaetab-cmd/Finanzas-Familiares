-- ============================================================
-- Finanzas Familiares - 07: fondos editables + saldo que pasa al mes siguiente
-- Ejecutar una vez en Supabase > SQL Editor > New query
-- Requiere haber corrido antes 06_fondos_y_mejoras.sql
-- No borra ni modifica movimientos existentes.
-- ============================================================

-- ---------- 1. CADA FONDO CON SU PROPIA CATEGORIA ----------
-- Antes la app sabia a que fondo iba un aporte por un listado fijo de
-- nombres. Ahora cada fondo apunta a su categoria de Transferencia, asi
-- se pueden crear y eliminar fondos desde la app.

alter table fondos add column if not exists categoria_id int references categorias(id);

update fondos f
set categoria_id = c.id
from categorias c
where f.categoria_id is null
  and c.grupo = 'Fondos'
  and c.nombre = f.nombre;

-- ---------- 2. CONFIGURACION COMPARTIDA ----------
-- Guarda desde que mes se empieza a arrastrar el saldo de un mes al
-- siguiente, y con cuanto parte ese mes. Se edita desde la pestana Mes.

create table if not exists configuracion (
  clave  text primary key,
  valor  text not null
);

insert into configuracion (clave, valor) values
  ('arrastre_desde', '2026-09'),
  ('arrastre_saldo_inicial', '0')
on conflict (clave) do nothing;

alter table configuracion enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'configuracion' and policyname = 'familia_lee_configuracion'
  ) then
    create policy "familia_lee_configuracion" on configuracion for select to authenticated using (true);
  end if;
  if not exists (
    select 1 from pg_policies where tablename = 'configuracion' and policyname = 'familia_escribe_configuracion'
  ) then
    create policy "familia_escribe_configuracion" on configuracion for all to authenticated using (true) with check (true);
  end if;
end $$;
