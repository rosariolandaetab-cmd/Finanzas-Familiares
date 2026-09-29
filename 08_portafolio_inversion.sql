-- ============================================================
-- Finanzas Familiares - 08: portafolio de inversion con cuotas
-- Ejecutar una vez en Supabase > SQL Editor > New query
-- Requiere haber corrido antes 07_fondos_dinamicos_y_arrastre.sql
--
-- Que cambia:
-- * La inversion pasa a ser un portafolio de "activos" (fondo del banco,
--   terreno, prestamo, deposito...). Cada activo tiene sus movimientos:
--   aporte, retiro, traspaso entre activos y actualizacion de valor.
-- * Todo el portafolio es una bolsa comun. Lo que le toca a Rocha y a Lalo
--   se lleva con CUOTAS, como un fondo mutuo: al aportar se "compran"
--   cuotas al valor del dia; las ganancias suben el valor de la cuota.
-- * "Bajo Lalo" deja de ser participante de la inversion y pasa a ser un
--   fondo (pestana Fondos) con su saldo actual.
--
-- No borra nada: la tabla inversion_movimientos queda como historial
-- anterior al cambio.
-- ============================================================

-- ---------- 1. TABLAS ----------

create table if not exists inversion_activos (
  id          serial primary key,
  nombre      text not null,
  tipo        text not null default 'OTRO'
              check (tipo in ('FONDO', 'DEPOSITO', 'ACCIONES', 'TERRENO', 'PROPIEDAD', 'PRESTAMO', 'OTRO')),
  comentario  text,
  activo      boolean not null default true,
  creado_en   timestamptz not null default now()
);

-- monto: cuanto cambia el valor del activo con este movimiento.
--   SALDO_INICIAL +, APORTE +, RETIRO -, TRASPASO - en el origen y + en el
--   destino, VALOR +/- (ganancia o perdida).
-- Valor actual del activo = suma de monto.
create table if not exists inversion_activo_movs (
  id             uuid primary key default gen_random_uuid(),
  operacion_id   uuid not null,          -- agrupa las filas de una misma operacion (un traspaso = 2 filas)
  fecha          date not null,
  activo_id      int not null references inversion_activos(id),
  tipo           text not null check (tipo in ('SALDO_INICIAL', 'APORTE', 'RETIRO', 'TRASPASO', 'VALOR')),
  monto          bigint not null,
  movimiento_id  uuid references movimientos(id) on delete set null,  -- transferencia en la cuenta comun
  comentario     text,
  creado_por     int references personas(id),
  creado_en      timestamptz not null default now()
);

create index if not exists inversion_activo_movs_fecha on inversion_activo_movs (fecha);
create index if not exists inversion_activo_movs_operacion on inversion_activo_movs (operacion_id);

-- cuotas de cada persona. cuotas > 0 compra (aporte), < 0 vende (retiro).
create table if not exists inversion_cuotas (
  id              uuid primary key default gen_random_uuid(),
  operacion_id    uuid not null,
  fecha           date not null,
  participante_id int not null references inversion_participantes(id),
  cuotas          numeric not null,
  valor_cuota     numeric not null,     -- valor de la cuota usado en esa operacion
  monto           bigint not null,      -- pesos que entran (+) o salen (-) para esta persona
  creado_en       timestamptz not null default now()
);

create index if not exists inversion_cuotas_operacion on inversion_cuotas (operacion_id);

alter table inversion_activos     enable row level security;
alter table inversion_activo_movs enable row level security;
alter table inversion_cuotas      enable row level security;

do $$
declare t text;
begin
  foreach t in array array['inversion_activos', 'inversion_activo_movs', 'inversion_cuotas']
  loop
    if not exists (select 1 from pg_policies where tablename = t and policyname = 'familia_lee_' || t) then
      execute format('create policy "familia_lee_%1$s" on %1$s for select to authenticated using (true)', t);
    end if;
    if not exists (select 1 from pg_policies where tablename = t and policyname = 'familia_escribe_' || t) then
      execute format('create policy "familia_escribe_%1$s" on %1$s for all to authenticated using (true) with check (true)', t);
    end if;
  end loop;
end $$;

-- ---------- 2. MIGRAR LO QUE HAY HOY ----------
-- Solo corre si todavia no hay activos (se puede ejecutar dos veces sin duplicar).

do $$
declare
  v_saldo_bajo_lalo bigint;
  v_saldo_rocha     bigint;
  v_saldo_lalo      bigint;
  v_rocha_id        int;
  v_lalo_id         int;
  v_activo_id       int;
  v_operacion       uuid := gen_random_uuid();
  v_codigo          text;
  v_orden           int;
  v_categoria_id    int;
  v_valor_cuota     numeric := 1000;
begin
  if exists (select 1 from inversion_activos) then
    return;
  end if;

  select saldo_actual into v_saldo_bajo_lalo from v_inversion_saldos where nombre = 'Bajo Lalo';
  select id, saldo_actual into v_rocha_id, v_saldo_rocha from v_inversion_saldos where nombre = 'Rocha';
  select id, saldo_actual into v_lalo_id, v_saldo_lalo from v_inversion_saldos where nombre = 'Lalo';

  -- 2a. Bajo Lalo -> fondo, con su propia categoria para aportar desde Registrar
  if not exists (select 1 from fondos where nombre = 'Bajo Lalo' and activo) then
    select 'FO-' || lpad((coalesce(max(substring(codigo from 4)::int), 0) + 1)::text, 2, '0'),
           coalesce(max(orden), 0) + 1
      into v_codigo, v_orden
      from categorias where codigo like 'FO-%';
    insert into categorias (codigo, tipo, grupo, nombre, orden, activa, presupuestable)
    values (v_codigo, 'TRANSFERENCIA', 'Fondos', 'Bajo Lalo', v_orden, true, false)
    returning id into v_categoria_id;
    insert into fondos (nombre, activo, saldo_inicial, categoria_id)
    values ('Bajo Lalo', true, greatest(coalesce(v_saldo_bajo_lalo, 0), 0), v_categoria_id);
  end if;
  update inversion_participantes set activo = false where nombre = 'Bajo Lalo';

  -- 2b. lo de Rocha y Lalo queda como saldo inicial del activo "Fondo banco"
  insert into inversion_activos (nombre, tipo, comentario)
  values ('Fondo banco', 'FONDO', 'Saldo traspasado desde la inversion anterior')
  returning id into v_activo_id;

  if coalesce(v_saldo_rocha, 0) + coalesce(v_saldo_lalo, 0) > 0 then
    insert into inversion_activo_movs (operacion_id, fecha, activo_id, tipo, monto, comentario)
    values (v_operacion, current_date, v_activo_id, 'SALDO_INICIAL',
            coalesce(v_saldo_rocha, 0) + coalesce(v_saldo_lalo, 0),
            'Saldo de Rocha y Lalo al pasar al portafolio');

    -- 2c. cuotas iniciales a $1.000 cada una
    if coalesce(v_saldo_rocha, 0) > 0 then
      insert into inversion_cuotas (operacion_id, fecha, participante_id, cuotas, valor_cuota, monto)
      values (v_operacion, current_date, v_rocha_id, v_saldo_rocha / v_valor_cuota, v_valor_cuota, v_saldo_rocha);
    end if;
    if coalesce(v_saldo_lalo, 0) > 0 then
      insert into inversion_cuotas (operacion_id, fecha, participante_id, cuotas, valor_cuota, monto)
      values (v_operacion, current_date, v_lalo_id, v_saldo_lalo / v_valor_cuota, v_valor_cuota, v_saldo_lalo);
    end if;
  end if;
end $$;
