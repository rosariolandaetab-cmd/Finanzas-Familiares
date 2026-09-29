-- ============================================================
-- Finanzas Familiares - 09: cuentas personales (Rocha)
-- Ejecutar una vez en Supabase > SQL Editor > New query
-- Requiere que Rocha ya haya entrado a la app al menos una vez
-- (su fila en "personas" debe tener auth_uid).
--
-- Cuentas personales separadas de las familiares:
-- * Tablas propias (personal_*), nunca se mezclan con los totales de la familia.
-- * Cada persona ve SOLO lo suyo (seguridad a nivel de fila en Supabase):
--   Lalo no puede leer las cuentas de Rocha, ni siquiera consultando directo.
-- * Cuando en la cuenta familiar se registra "Asignacion personal Rocha",
--   aparece solo como ingreso en las cuentas de Rocha (y se actualiza o
--   borra si se edita o borra el movimiento familiar).
-- ============================================================

-- ---------- 1. QUIEN SOY ----------
create or replace function mi_persona_id() returns int
language sql stable security definer set search_path = public as $$
  select id from personas where auth_uid = auth.uid()
$$;

-- ---------- 2. TABLAS ----------

create table if not exists personal_cuentas (
  id               serial primary key,
  persona_id       int not null references personas(id) default mi_persona_id(),
  nombre           text not null,
  tipo             text not null check (tipo in ('DEBITO', 'CREDITO', 'EFECTIVO')),
  banco            text,
  ultimos4         text,
  dia_facturacion  int,
  dia_vencimiento  int,
  orden            int not null default 0,
  activa           boolean not null default true
);

create table if not exists personal_categorias (
  id          serial primary key,
  persona_id  int not null references personas(id) default mi_persona_id(),
  tipo        text not null check (tipo in ('GASTO', 'INGRESO')),
  nombre      text not null,
  orden       int not null default 999,
  activa      boolean not null default true,
  unique (persona_id, nombre)
);

create table if not exists personal_movimientos (
  id                      uuid primary key default gen_random_uuid(),
  persona_id              int not null references personas(id) default mi_persona_id(),
  fecha                   date not null,
  categoria_id            int not null references personal_categorias(id),
  cuenta_id               int references personal_cuentas(id),   -- null en ingresos
  monto                   bigint not null,
  estado                  text not null default 'PAGADO' check (estado in ('PENDIENTE', 'PAGADO')),
  fecha_pago              date,
  comentario              text,
  -- si viene de la asignacion personal registrada en la cuenta familiar
  movimiento_familiar_id  uuid unique references movimientos(id) on delete cascade,
  creado_en               timestamptz not null default now(),
  actualizado_en          timestamptz not null default now()
);

create index if not exists personal_movimientos_persona_fecha on personal_movimientos (persona_id, fecha);

-- ---------- 3. SEGURIDAD: cada uno ve solo lo suyo ----------

alter table personal_cuentas     enable row level security;
alter table personal_categorias  enable row level security;
alter table personal_movimientos enable row level security;

do $$
declare t text;
begin
  foreach t in array array['personal_cuentas', 'personal_categorias', 'personal_movimientos']
  loop
    if not exists (select 1 from pg_policies where tablename = t and policyname = 'solo_dueno_' || t) then
      execute format(
        'create policy "solo_dueno_%1$s" on %1$s for all to authenticated
           using (persona_id = mi_persona_id()) with check (persona_id = mi_persona_id())', t);
    end if;
  end loop;
end $$;

-- ---------- 4. ASIGNACION PERSONAL -> INGRESO PERSONAL ----------
-- La categoria familiar "Asignacion personal <Nombre>" alimenta la categoria
-- personal "Asignacion personal" de esa persona (si la tiene).

create or replace function sincronizar_asignacion_personal() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_nombre_cat   text;
  v_persona_id   int;
  v_categoria_id int;
begin
  select c.nombre into v_nombre_cat from categorias c where c.id = new.categoria_id;

  if v_nombre_cat like 'Asignacion personal %' then
    select p.id into v_persona_id
      from personas p where p.nombre = trim(substring(v_nombre_cat from length('Asignacion personal ') + 1));
    select pc.id into v_categoria_id
      from personal_categorias pc where pc.persona_id = v_persona_id and pc.nombre = 'Asignacion personal';
  end if;

  if v_categoria_id is null then
    -- ya no es (o nunca fue) una asignacion personal con destino
    delete from personal_movimientos where movimiento_familiar_id = new.id;
    return new;
  end if;

  insert into personal_movimientos (persona_id, fecha, categoria_id, monto, estado, comentario, movimiento_familiar_id)
  values (v_persona_id, new.fecha_compra, v_categoria_id, new.monto, 'PAGADO', 'Desde la cuenta familiar', new.id)
  on conflict (movimiento_familiar_id) do update
    set persona_id = excluded.persona_id,
        fecha = excluded.fecha,
        categoria_id = excluded.categoria_id,
        monto = excluded.monto,
        actualizado_en = now();
  return new;
end $$;

drop trigger if exists trg_asignacion_personal on movimientos;
create trigger trg_asignacion_personal
  after insert or update of categoria_id, monto, fecha_compra on movimientos
  for each row execute function sincronizar_asignacion_personal();

-- ---------- 5. DATOS INICIALES PARA ROCHA ----------

do $$
declare v_rocha int;
begin
  select id into v_rocha from personas where nombre = 'Rocha';
  if v_rocha is null then
    raise notice 'No encontre a Rocha en personas';
    return;
  end if;

  if not exists (select 1 from personal_cuentas where persona_id = v_rocha) then
    insert into personal_cuentas (persona_id, nombre, tipo, banco, orden) values
      (v_rocha, 'Debito', 'DEBITO', null, 1),
      (v_rocha, 'Tarjeta Santander', 'CREDITO', 'Santander', 2),
      (v_rocha, 'Efectivo', 'EFECTIVO', null, 3);
  end if;

  insert into personal_categorias (persona_id, tipo, nombre, orden) values
    (v_rocha, 'GASTO', 'Comida afuera', 1),
    (v_rocha, 'GASTO', 'Supermercado', 2),
    (v_rocha, 'GASTO', 'Ropa y calzado', 3),
    (v_rocha, 'GASTO', 'Belleza y cuidado', 4),
    (v_rocha, 'GASTO', 'Transporte', 5),
    (v_rocha, 'GASTO', 'Salidas y panoramas', 6),
    (v_rocha, 'GASTO', 'Regalos', 7),
    (v_rocha, 'GASTO', 'Salud', 8),
    (v_rocha, 'GASTO', 'Suscripciones', 9),
    (v_rocha, 'GASTO', 'Hogar y deco', 10),
    (v_rocha, 'GASTO', 'Otros', 11),
    (v_rocha, 'INGRESO', 'Asignacion personal', 1),
    (v_rocha, 'INGRESO', 'Otros ingresos', 2)
  on conflict (persona_id, nombre) do nothing;
end $$;

-- ---------- 6. TRAER LAS ASIGNACIONES YA REGISTRADAS DESDE SEPTIEMBRE 2026 ----------
-- (dispara el trigger sobre los movimientos existentes sin cambiarlos)
update movimientos m
set fecha_compra = m.fecha_compra
from categorias c
where c.id = m.categoria_id
  and c.nombre like 'Asignacion personal %'
  and m.fecha_compra >= '2026-09-01';
