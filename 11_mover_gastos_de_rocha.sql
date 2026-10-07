-- ============================================================
-- Finanzas Familiares - 11: pasar a las cuentas de Rocha lo que anoto
-- con su usuario en la cuenta familiar
-- Requiere 09_cuentas_personales.sql
--
-- Se corre en DOS pasos, cada uno como su propia consulta en
-- Supabase > SQL Editor > New query.
--
-- Que se mueve: gastos VARIABLES (supermercado, restaurant, delivery,
-- salidas, regalos, transporte, salud, mascota, otros...) creados por el
-- usuario de Rocha.
-- Que NO se mueve (son de la familia aunque los haya anotado ella):
-- ingresos (sueldos, arriendos), gastos fijos, deudas, asignaciones
-- personales, fondos, inversion y transferencias.
--
-- Cada gasto se crea en las cuentas de Rocha con una categoria parecida y
-- el mismo medio de pago (cuenta corriente -> Debito, tarjeta familiar ->
-- Tarjeta Santander, efectivo -> Efectivo), y recien entonces se borra de
-- la cuenta familiar.
-- ============================================================


-- ---------- PASO 1: REVISAR (no cambia nada) ----------
-- Muestra que se va a mover y a que categoria/medio de pago queda.
-- Si hay algo que en realidad era de la familia, anota su fecha y monto
-- y avisale a Claude antes del paso 2.

select m.fecha_compra as fecha,
       c.nombre       as categoria_familiar,
       m.monto,
       m.comentario,
       cu.nombre      as pagado_con,
       m.estado
from movimientos m
join categorias c on c.id = m.categoria_id
join cuentas cu on cu.id = m.cuenta_id
join personas p on p.id = m.creado_por
where p.nombre = 'Rocha'
  and c.tipo = 'GASTO'
  and c.grupo like 'Variables%'
order by m.fecha_compra;


-- ---------- PASO 2: MOVER (correr solo despues de revisar el paso 1) ----------
-- Copia desde aqui hasta el final en una consulta nueva.

do $$
declare
  v_rocha        int;
  v_otros        int;
  v_movidos      int := 0;
  r              record;
  v_categoria    int;
  v_cuenta       int;
  v_tipo_cuenta  text;
begin
  select id into v_rocha from personas where nombre = 'Rocha';
  select id into v_otros from personal_categorias where persona_id = v_rocha and nombre = 'Otros';
  if v_rocha is null or v_otros is null then
    raise exception 'No encontre a Rocha o sus categorias personales (corre antes el 09).';
  end if;

  for r in
    select m.*, c.codigo, cu.tipo as tipo_cuenta
    from movimientos m
    join categorias c on c.id = m.categoria_id
    join cuentas cu on cu.id = m.cuenta_id
    join personas p on p.id = m.creado_por
    where p.nombre = 'Rocha'
      and c.tipo = 'GASTO'
      and c.grupo like 'Variables%'
  loop
    -- categoria personal equivalente
    select pc.id into v_categoria
    from personal_categorias pc
    where pc.persona_id = v_rocha
      and pc.nombre = case r.codigo
        when 'VA-01' then 'Supermercado'
        when 'VA-06' then 'Comida afuera'
        when 'VA-07' then 'Comida afuera'
        when 'VA-08' then 'Salidas y panoramas'
        when 'VA-02' then 'Transporte'
        when 'VA-03' then 'Transporte'
        when 'VA-05' then 'Transporte'
        when 'VA-09' then 'Salud'
        when 'VA-11' then 'Regalos'
        else 'Otros' end;
    v_categoria := coalesce(v_categoria, v_otros);

    -- medio de pago personal equivalente
    v_tipo_cuenta := case r.tipo_cuenta when 'TARJETA_CREDITO' then 'CREDITO'
                                        when 'EFECTIVO' then 'EFECTIVO'
                                        else 'DEBITO' end;
    select id into v_cuenta from personal_cuentas
     where persona_id = v_rocha and tipo = v_tipo_cuenta and activa order by orden limit 1;

    insert into personal_movimientos (persona_id, fecha, categoria_id, cuenta_id, monto, estado, fecha_pago, comentario)
    values (
      v_rocha, r.fecha_compra, v_categoria, v_cuenta, r.monto,
      case when v_tipo_cuenta = 'CREDITO' then r.estado::text else 'PAGADO' end,
      case when v_tipo_cuenta = 'CREDITO' and r.estado = 'PENDIENTE' then null
           else coalesce(r.fecha_caja, r.fecha_compra) end,
      r.comentario
    );
    delete from movimientos where id = r.id;
    v_movidos := v_movidos + 1;
  end loop;

  raise notice 'Se movieron % gastos a las cuentas de Rocha.', v_movidos;
end $$;
