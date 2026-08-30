-- ============================================================
-- Finanzas Familiares - actualizacion: inversion + categorias
-- Ejecutar completo en Supabase > SQL Editor > New query
-- No modifica ni borra datos existentes: solo agrupa/desactiva
-- categorias, agrega una columna nueva, y crea tablas nuevas
-- para la seccion Inversion.
-- ============================================================

-- ---------- 1. AGRUPAR CATEGORIAS DE GASTO ----------
-- "Fijos hogar/auto/servicios/inversion" -> "Fijos"
-- "Variables hogar/ocio/auto" -> "Variables"
-- Esto no rompe v_resumen_mensual ni v_presupuesto_mes: siguen
-- filtrando con LIKE 'Fijos%' / LIKE 'Variables%', y "Fijos" y
-- "Variables" calzan con ese patron igual que antes.

update categorias set grupo = 'Fijos'
where codigo in ('FI-01','FI-02','FI-03','FI-04','FI-05','FI-06','FI-07','FI-08','FI-09','FI-10','FI-11');

update categorias set grupo = 'Variables'
where codigo in ('VA-01','VA-02','VA-03','VA-04','VA-05','VA-06','VA-07','VA-08','VA-09','VA-10','VA-11','VA-99');

-- ---------- 2. DESACTIVAR CATEGORIAS ----------
-- No se borran (el historial que ya las usa sigue intacto), solo
-- dejan de aparecer para elegir en movimientos nuevos.

update categorias set activa = false
where codigo in (
  'VA-12',  -- Gasto: Personal
  'IN-04',  -- Ingreso: Utilidad inversiones (se maneja en Inversion)
  'TR-05',  -- Transferencia: Garantia arriendo
  'TR-02'   -- Transferencia: Retiro de inversion (se maneja en Inversion)
);

-- ---------- 3. QUE CATEGORIAS SE PUEDEN PRESUPUESTAR ----------

alter table categorias add column if not exists presupuestable boolean not null default true;

update categorias set presupuestable = false
where codigo in (
  'FO-02', -- Casa y equipamiento
  'DE-01', -- Cuota Deptos
  'FI-09', -- Suscripciones
  'FI-07', -- Limpieza
  'FI-01', -- Arriendo
  'FI-02', -- Gastos Comunes
  'FI-08', -- Seguro Auto
  'VA-04', -- Mantencion auto
  'VA-03', -- Tag
  'DE-02', -- CAE
  'FI-05', -- Internet
  'FI-03', -- Luz
  'FI-04', -- Gas
  'FI-06', -- Celular
  'VA-09', -- Salud
  'FI-10', -- Comisiones bancarias
  'DE-03'  -- Otras deudas
);

-- ---------- 4. SECCION INVERSION ----------
-- 3 participantes (Rocha, Lalo, Bajo Lalo). "Bajo Lalo" es un
-- bolsillo aparte, no una persona que use la app, por eso va en
-- una tabla propia y no en "personas".

create type tipo_mov_inversion as enum ('APORTE', 'GANANCIA', 'RETIRO');

create table inversion_participantes (
  id            serial primary key,
  nombre        text not null unique,
  saldo_inicial bigint not null default 0,  -- se carga una vez, manual
  activo        boolean not null default true
);

insert into inversion_participantes (nombre) values ('Rocha'), ('Lalo'), ('Bajo Lalo');

-- cuenta para las ganancias de inversion (no es plata que entra al banco,
-- es solo crecimiento dentro de la inversion). El tipo INVERSION ya
-- estaba contemplado en el esquema original.
insert into cuentas (nombre, tipo, activa)
select 'Inversion', 'INVERSION', true
where not exists (select 1 from cuentas where tipo = 'INVERSION');

create table inversion_movimientos (
  id                  uuid primary key default gen_random_uuid(),
  fecha               date not null,
  tipo                tipo_mov_inversion not null,
  participante_id     int not null references inversion_participantes(id),
  monto               bigint not null,  -- positivo aporte/ganancia, negativo retiro
  porcentaje_aplicado numeric,          -- % usado en ese momento, para el detalle
  movimiento_id       uuid references movimientos(id),  -- la transferencia/ingreso asociado en la cuenta comun
  comentario          text,
  creado_por          int references personas(id),
  creado_en           timestamptz not null default now()
);

create index on inversion_movimientos (participante_id);
create index on inversion_movimientos (fecha);

-- saldo actual = saldo inicial + todo lo registrado despues
create view v_inversion_saldos as
select
  p.id,
  p.nombre,
  p.saldo_inicial + coalesce(sum(m.monto), 0) as saldo_actual
from inversion_participantes p
left join inversion_movimientos m on m.participante_id = p.id
where p.activo
group by p.id, p.nombre, p.saldo_inicial;

alter table inversion_participantes enable row level security;
alter table inversion_movimientos    enable row level security;

create policy "familia_lee_inversion_participantes" on inversion_participantes for select to authenticated using (true);
create policy "familia_escribe_inversion_participantes" on inversion_participantes for all to authenticated using (true) with check (true);
create policy "familia_lee_inversion_movimientos" on inversion_movimientos for select to authenticated using (true);
create policy "familia_escribe_inversion_movimientos" on inversion_movimientos for all to authenticated using (true) with check (true);
