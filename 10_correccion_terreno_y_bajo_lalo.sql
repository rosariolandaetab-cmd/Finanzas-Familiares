-- ============================================================
-- Finanzas Familiares - 10: correcciones del portafolio
-- Ejecutar una vez en Supabase > SQL Editor > New query
-- Requiere haber corrido antes 08_portafolio_inversion.sql
--
-- 1. El retiro de ~30M de la inversion NO fue a la caja: se convierte en
--    un traspaso a "Terreno 1 - Puerto Varas". Se borra el "Retiro de
--    inversion" que habia quedado en la cuenta comun (y deja de aparecer
--    en la pestana Mes). El comentario guarda cuanto era de Rocha y Lalo.
--    Si el terreno es de la bolsa comun, el reparto de Rocha y Lalo en el
--    portafolio vuelve a ser el de antes del retiro.
-- 2. "Bajo Lalo" vuelve a la inversion como bolsillo (con sus cuotas): su
--    plata esta en el fondo del banco y gana igual que el resto. Deja de
--    ser un fondo en la pestana Fondos.
--
-- Si algo no calza (no encuentra el retiro, o encuentra mas de uno), el
-- script se detiene con un mensaje y NO cambia nada.
-- ============================================================

do $$
declare
  v_terreno_id    int;
  v_ops           int;
  v_op            uuid;
  v_fila          record;
  v_nota          text;
  v_mov_id        uuid;
  v_monto         bigint;
  v_total         numeric;
  v_cuotas        numeric;
  v_valor_cuota   numeric;
  v_rocha_id      int;
  v_lalo_id       int;
  v_bl_id         int;
  v_monto_rocha   bigint;
  v_monto_lalo    bigint;
  v_fondo_id      int;
  v_saldo_bl      bigint;
  v_banco_id      int;
begin
  select id into v_rocha_id from inversion_participantes where nombre = 'Rocha';
  select id into v_lalo_id  from inversion_participantes where nombre = 'Lalo';
  select id into v_bl_id    from inversion_participantes where nombre = 'Bajo Lalo';

  -- ---------- 1. RETIRO DE 30M -> TERRENO ----------

  select id into v_terreno_id from inversion_activos
   where activo and nombre ilike '%puerto varas%' order by id limit 1;
  if v_terreno_id is null then
    insert into inversion_activos (nombre, tipo) values ('Terreno 1 - Puerto Varas', 'TERRENO')
    returning id into v_terreno_id;
  end if;

  if exists (select 1 from inversion_activo_movs where activo_id = v_terreno_id) then
    raise notice 'El terreno ya tiene movimientos: se salta la parte 1 para no duplicar.';
  else
    -- 1a. retiro hecho en el portafolio nuevo (despues del script 08)
    select count(distinct operacion_id) into v_ops
      from inversion_activo_movs where tipo = 'RETIRO' and monto <= -25000000;

    if v_ops > 1 then
      raise exception 'Hay % retiros de mas de 25M en el portafolio; no se cual corregir. Avisale a Claude.', v_ops;
    elsif v_ops = 1 then
      select * into v_fila from inversion_activo_movs where tipo = 'RETIRO' and monto <= -25000000;
      v_op := v_fila.operacion_id;
      v_mov_id := v_fila.movimiento_id;
      v_monto := -v_fila.monto;

      select string_agg(p.nombre || ' $' || replace(to_char(-c.monto, 'FM999,999,999,999'), ',', '.')
                        || ' (' || round(100.0 * c.monto / v_fila.monto) || '%)', ', ' order by p.id)
        into v_nota
        from inversion_cuotas c join inversion_participantes p on p.id = c.participante_id
       where c.operacion_id = v_op;
      v_nota := 'Traspaso a terreno (antes registrado como retiro). Asignacion: ' || coalesce(v_nota, 'sin detalle');

      update inversion_activo_movs
         set tipo = 'TRASPASO', movimiento_id = null,
             comentario = concat_ws(' · ', comentario, v_nota)
       where id = v_fila.id;
      insert into inversion_activo_movs (operacion_id, fecha, activo_id, tipo, monto, comentario, creado_por)
      values (v_op, v_fila.fecha, v_terreno_id, 'TRASPASO', v_monto, concat_ws(' · ', v_fila.comentario, v_nota), v_fila.creado_por);

      -- un traspaso no cambia de quien es la plata: se deshace la venta de cuotas
      delete from inversion_cuotas where operacion_id = v_op;
      if v_mov_id is not null then
        delete from movimientos where id = v_mov_id;
      end if;
      raise notice 'Retiro de % convertido en traspaso al terreno.', v_monto;

    else
      -- 1b. retiro hecho antes del portafolio (sistema anterior)
      select count(*) into v_ops from (
        select movimiento_id from inversion_movimientos
         where tipo = 'RETIRO' and movimiento_id is not null
         group by movimiento_id having sum(monto) <= -25000000) x;
      if v_ops <> 1 then
        raise exception 'Encontre % retiros de mas de 25M (esperaba 1). Avisale a Claude.', v_ops;
      end if;

      select movimiento_id, -sum(monto), min(fecha)::text into v_mov_id, v_monto, v_nota
        from inversion_movimientos where tipo = 'RETIRO' and movimiento_id is not null
       group by movimiento_id having sum(monto) <= -25000000;
      select coalesce(-sum(monto), 0) into v_monto_rocha from inversion_movimientos
       where movimiento_id = v_mov_id and participante_id = v_rocha_id;
      select coalesce(-sum(monto), 0) into v_monto_lalo from inversion_movimientos
       where movimiento_id = v_mov_id and participante_id = v_lalo_id;

      select coalesce(sum(monto), 0) into v_total from inversion_activo_movs;
      select coalesce(sum(cuotas), 0) into v_cuotas from inversion_cuotas;
      v_valor_cuota := case when v_cuotas > 0 then v_total / v_cuotas else 1000 end;
      v_op := gen_random_uuid();

      insert into inversion_activo_movs (operacion_id, fecha, activo_id, tipo, monto, comentario)
      values (v_op, v_nota::date, v_terreno_id, 'SALDO_INICIAL', v_monto,
              'Retiro de la inversion anterior pasado a terreno. Asignacion: Rocha $'
              || replace(to_char(v_monto_rocha, 'FM999,999,999,999'), ',', '.')
              || ' (' || round(100.0 * v_monto_rocha / v_monto) || '%), Lalo $'
              || replace(to_char(v_monto_lalo, 'FM999,999,999,999'), ',', '.')
              || ' (' || round(100.0 * v_monto_lalo / v_monto) || '%)');
      insert into inversion_cuotas (operacion_id, fecha, participante_id, cuotas, valor_cuota, monto) values
        (v_op, v_nota::date, v_rocha_id, v_monto_rocha / v_valor_cuota, v_valor_cuota, v_monto_rocha),
        (v_op, v_nota::date, v_lalo_id,  v_monto_lalo  / v_valor_cuota, v_valor_cuota, v_monto_lalo);

      update inversion_movimientos set movimiento_id = null where movimiento_id = v_mov_id;
      delete from movimientos where id = v_mov_id;
      raise notice 'Retiro anterior de % pasado al terreno.', v_monto;
    end if;
  end if;

  -- ---------- 2. BAJO LALO VUELVE A LA INVERSION ----------

  select f.id, v.saldo_actual into v_fondo_id, v_saldo_bl
    from fondos f join v_fondos_saldos v on v.id = f.id
   where f.nombre = 'Bajo Lalo' and f.activo;

  if v_fondo_id is null or v_bl_id is null then
    raise notice 'Bajo Lalo ya no esta en Fondos: se salta la parte 2.';
  else
    select id into v_banco_id from inversion_activos where activo and nombre = 'Fondo banco';
    if v_banco_id is null then
      select id into v_banco_id from inversion_activos where activo and tipo = 'FONDO' order by id limit 1;
    end if;
    if v_banco_id is null then
      raise exception 'No encontre el activo "Fondo banco" para dejar la plata de Bajo Lalo.';
    end if;

    update inversion_participantes set activo = true where id = v_bl_id;

    if v_saldo_bl > 0 then
      select coalesce(sum(monto), 0) into v_total from inversion_activo_movs;
      select coalesce(sum(cuotas), 0) into v_cuotas from inversion_cuotas;
      v_valor_cuota := case when v_cuotas > 0 then v_total / v_cuotas else 1000 end;
      v_op := gen_random_uuid();
      insert into inversion_activo_movs (operacion_id, fecha, activo_id, tipo, monto, comentario)
      values (v_op, current_date, v_banco_id, 'SALDO_INICIAL', v_saldo_bl, 'Bajo Lalo vuelve a la inversion (estaba en Fondos)');
      insert into inversion_cuotas (operacion_id, fecha, participante_id, cuotas, valor_cuota, monto)
      values (v_op, current_date, v_bl_id, v_saldo_bl / v_valor_cuota, v_valor_cuota, v_saldo_bl);
    end if;

    update fondos set activo = false where id = v_fondo_id;
    update categorias set activa = false where id = (select categoria_id from fondos where id = v_fondo_id);
    raise notice 'Bajo Lalo vuelve a la inversion con %.', v_saldo_bl;
  end if;
end $$;

-- resultado para revisar
select a.nombre, sum(m.monto) as valor
from inversion_activos a left join inversion_activo_movs m on m.activo_id = a.id
where a.activo group by a.id, a.nombre order by a.id;
