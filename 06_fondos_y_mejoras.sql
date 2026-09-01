-- 06: agrega "grupo" a v_presupuesto_mes (para el desglose segmentado),
-- y crea el sistema de Fondos (Vacaciones, Casa y equipamiento, Fondo de
-- reserva), separado de Inversion, con su propia lista de movimientos
-- (aportes y retiros) igual que Inversion.

-- 1. agregar grupo a la vista de presupuesto, para poder agrupar por
--    Fijos / Deudas / Asignacion personal / Variables en la app
create or replace view v_presupuesto_mes as
select p.periodo,
       c.nombre as categoria,
       c.grupo  as grupo,
       p.tipo,
       p.valor,
       case when p.tipo='FIJO' then p.valor
            else round(p.valor * coalesce(r.ingreso_recurrente,0) / 1000) * 1000 end as tope,
       coalesce(g.gastado, 0) as gastado
from presupuestos p
join categorias c on c.id = p.categoria_id
left join v_resumen_mensual r on r.periodo = p.periodo
left join (
  select categoria_id, periodo_devengado, sum(monto) as gastado
  from v_movimientos where tipo_flujo='GASTO' group by 1,2
) g on g.categoria_id = p.categoria_id and g.periodo_devengado = p.periodo;

-- 2. tabla fondos: ya existia (sin usar), le agregamos saldo_inicial igual
--    que a inversion_participantes, y sembramos los 3 fondos
alter table fondos add column if not exists saldo_inicial bigint not null default 0;

insert into fondos (nombre, activo)
select 'Vacaciones', true
where not exists (select 1 from fondos where nombre = 'Vacaciones');

insert into fondos (nombre, activo)
select 'Casa y equipamiento', true
where not exists (select 1 from fondos where nombre = 'Casa y equipamiento');

insert into fondos (nombre, activo)
select 'Fondo de reserva', true
where not exists (select 1 from fondos where nombre = 'Fondo de reserva');

-- 3. lista de movimientos de fondos, igual que inversion_movimientos
create table if not exists fondos_movimientos (
  id               uuid primary key default gen_random_uuid(),
  fecha            date not null,
  tipo             text not null check (tipo in ('APORTE','RETIRO')),
  fondo_id         int not null references fondos(id),
  monto            bigint not null,
  movimiento_id    uuid references movimientos(id),
  comentario       text,
  creado_por       int references personas(id),
  creado_en        timestamptz not null default now()
);

alter table fondos_movimientos enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'fondos_movimientos' and policyname = 'familia_lee_fondos_movimientos'
  ) then
    create policy "familia_lee_fondos_movimientos" on fondos_movimientos for select to authenticated using (true);
  end if;
  if not exists (
    select 1 from pg_policies where tablename = 'fondos_movimientos' and policyname = 'familia_escribe_fondos_movimientos'
  ) then
    create policy "familia_escribe_fondos_movimientos" on fondos_movimientos for all to authenticated using (true) with check (true);
  end if;
end $$;

create or replace view v_fondos_saldos as
select f.id,
       f.nombre,
       f.saldo_inicial + coalesce(sum(case when fm.tipo = 'APORTE' then fm.monto
                                            when fm.tipo = 'RETIRO' then -fm.monto
                                            else 0 end), 0) as saldo_actual
from fondos f
left join fondos_movimientos fm on fm.fondo_id = f.id
where f.activo
group by f.id, f.nombre, f.saldo_inicial
order by f.id;

-- 4. las 2 categorias de Fondos pasan de GASTO a TRANSFERENCIA: aportar a un
--    fondo no es un gasto, es guardar plata (misma logica que "Aporte a
--    inversion"). Se agrega el 3er fondo (Fondo de reserva) y su categoria
--    de retiro, para poder ingresar/retirar desde Registrar.
update categorias set tipo = 'TRANSFERENCIA' where codigo in ('FO-01', 'FO-02');

insert into categorias (codigo, tipo, grupo, nombre, orden, activa, presupuestable)
select 'FO-03', 'TRANSFERENCIA', 'Fondos', 'Fondo de reserva', 42, true, false
where not exists (select 1 from categorias where codigo = 'FO-03');

insert into categorias (codigo, tipo, grupo, nombre, orden, activa, presupuestable)
select 'TR-06', 'TRANSFERENCIA', 'Transferencia', 'Retiro de fondo', 43, true, false
where not exists (select 1 from categorias where codigo = 'TR-06');
