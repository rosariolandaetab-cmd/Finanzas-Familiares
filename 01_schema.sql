-- ============================================================
-- Finanzas Familiares - esquema Supabase (PostgreSQL)
-- Ejecutar completo en Supabase > SQL Editor > New query
-- ============================================================

-- ---------- 1. CATALOGOS ----------

create type tipo_flujo as enum ('INGRESO', 'GASTO', 'TRANSFERENCIA');
create type tipo_cuenta as enum ('CORRIENTE', 'TARJETA_CREDITO', 'EFECTIVO', 'INVERSION');
create type estado_mov as enum ('PENDIENTE', 'PAGADO');
create type recurrencia as enum ('RECURRENTE', 'EXTRAORDINARIO', 'TRANSFERENCIA');
create type tipo_tope as enum ('FIJO', 'PORCENTAJE');

create table personas (
  id          serial primary key,
  nombre      text not null unique,
  auth_uid    uuid references auth.users(id),   -- se llena cuando cada uno crea su login
  activa      boolean not null default true
);

create table cuentas (
  id                serial primary key,
  nombre            text not null,
  tipo              tipo_cuenta not null,
  banco             text,
  ultimos4          text,
  -- solo para tarjetas de credito:
  dia_facturacion   int,        -- dia del mes en que cierra el estado de cuenta
  dia_vencimiento   int,        -- dia del mes en que se paga
  cuenta_pago_id    int references cuentas(id),  -- desde que cuenta corriente se paga
  activa            boolean not null default true
);

create table categorias (
  id            serial primary key,
  codigo        text not null unique,     -- FI-01, VA-08, etc
  tipo          tipo_flujo not null,
  grupo         text not null,            -- Fijos hogar, Variables ocio, Deudas...
  nombre        text not null,
  orden         int not null default 999, -- para ordenar el selector por frecuencia de uso
  activa        boolean not null default true
);

create table propiedades (
  id       serial primary key,
  nombre   text not null,
  activa   boolean not null default true
);

create table fondos (
  id                serial primary key,
  nombre            text not null,
  aporte_mensual    bigint not null default 0,
  saldo_objetivo    bigint,
  activo            boolean not null default true
);

-- ---------- 2. CICLOS DE TARJETA DE CREDITO ----------
-- Un ciclo agrupa todas las compras de una tarjeta entre dos fechas de facturacion.
-- Cuando llega el correo "Aviso de pago de tarjeta", se cierra el ciclo.

create table ciclos_tarjeta (
  id                  serial primary key,
  cuenta_id           int not null references cuentas(id),
  periodo             text not null,          -- '2026-08'
  fecha_facturacion   date not null,
  fecha_vencimiento   date not null,
  total_facturado     bigint,                 -- lo que dice el estado de cuenta
  total_pagado        bigint,                 -- lo que efectivamente se pago
  fecha_pago          date,
  cerrado             boolean not null default false,
  unique (cuenta_id, periodo)
);

-- ---------- 3. MOVIMIENTOS ----------
-- fecha_compra = cuando ocurrio el gasto  -> manda para el PRESUPUESTO
-- fecha_caja   = cuando salio del banco   -> manda para la CONCILIACION
-- En debito/efectivo las dos son iguales. En credito, fecha_caja se llena al pagar el ciclo.

create table movimientos (
  id              uuid primary key default gen_random_uuid(),
  fecha_compra    date not null,
  fecha_caja      date,
  categoria_id    int not null references categorias(id),
  monto           bigint not null,            -- positivo siempre; negativo solo si es reembolso
  cuenta_id       int not null references cuentas(id),
  estado          estado_mov not null default 'PAGADO',
  recurrencia     recurrencia not null default 'RECURRENTE',
  persona_id      int references personas(id),
  propiedad_id    int references propiedades(id),
  fondo_id        int references fondos(id),
  ciclo_id        int references ciclos_tarjeta(id),
  comentario      text,
  -- trazabilidad
  origen          text not null default 'MANUAL',   -- MANUAL | CORREO | CARTOLA | RECURRENTE
  id_externo      text,                              -- nro de operacion del banco, para no duplicar
  creado_por      int references personas(id),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

create index on movimientos (fecha_compra);
create index on movimientos (fecha_caja);
create index on movimientos (categoria_id);
create index on movimientos (estado);
create unique index on movimientos (id_externo) where id_externo is not null;

-- periodo calculado, para agrupar sin pelear con fechas
create view v_movimientos as
select m.*,
       to_char(m.fecha_compra, 'YYYY-MM') as periodo_devengado,
       to_char(m.fecha_caja,   'YYYY-MM') as periodo_caja,
       c.nombre  as categoria,
       c.grupo   as grupo,
       c.tipo    as tipo_flujo
from movimientos m
join categorias c on c.id = m.categoria_id;

-- ---------- 4. PRESUPUESTO ----------

create table presupuestos (
  id            serial primary key,
  periodo       text not null,               -- '2026-09'
  categoria_id  int not null references categorias(id),
  tipo          tipo_tope not null,
  valor         numeric not null,            -- pesos si FIJO, fraccion (0.055) si PORCENTAJE
  unique (periodo, categoria_id)
);

create table reglas_ingreso (
  id           serial primary key,
  destino      text not null,                -- Deudas, Fijos, Asignacion personal, Variables, Fondos, Ahorro
  porcentaje   numeric not null,
  vigente_desde date not null default current_date
);

-- ---------- 5. VISTAS DE REPORTE ----------

create view v_resumen_mensual as
select periodo_devengado as periodo,
       sum(case when tipo_flujo='INGRESO' and recurrencia='RECURRENTE'     then monto else 0 end) as ingreso_recurrente,
       sum(case when tipo_flujo='INGRESO' and recurrencia='EXTRAORDINARIO' then monto else 0 end) as ingreso_extraordinario,
       sum(case when tipo_flujo='GASTO' and grupo like 'Fijos%'            then monto else 0 end) as fijos,
       sum(case when tipo_flujo='GASTO' and grupo = 'Deudas'               then monto else 0 end) as deudas,
       sum(case when tipo_flujo='GASTO' and grupo = 'Asignacion personal'  then monto else 0 end) as asignacion_personal,
       sum(case when tipo_flujo='GASTO' and grupo like 'Variables%'        then monto else 0 end) as variables,
       sum(case when tipo_flujo='GASTO' and grupo = 'Fondos'               then monto else 0 end) as fondos,
       sum(case when tipo_flujo='GASTO' then monto else 0 end)                                    as gasto_total
from v_movimientos
group by 1;

create view v_presupuesto_mes as
select p.periodo,
       c.nombre as categoria,
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

-- deuda de tarjeta viva: compras a credito que todavia no salen del banco
create view v_deuda_tarjeta as
select cu.nombre as tarjeta, count(*) as compras, sum(m.monto) as total_pendiente
from movimientos m
join cuentas cu on cu.id = m.cuenta_id
where m.estado = 'PENDIENTE' and cu.tipo = 'TARJETA_CREDITO'
group by 1;

-- ---------- 6. SEGURIDAD ----------
-- Los dos ven todo (es plata comun). Solo usuarios autenticados.

alter table movimientos     enable row level security;
alter table presupuestos    enable row level security;
alter table ciclos_tarjeta  enable row level security;
alter table categorias      enable row level security;
alter table cuentas         enable row level security;
alter table fondos          enable row level security;
alter table personas        enable row level security;
alter table propiedades     enable row level security;
alter table reglas_ingreso  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['movimientos','presupuestos','ciclos_tarjeta','categorias',
                           'cuentas','fondos','personas','propiedades','reglas_ingreso']
  loop
    execute format('create policy "familia_lee_%1$s" on %1$s for select to authenticated using (true)', t);
    execute format('create policy "familia_escribe_%1$s" on %1$s for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
