-- ============================================================
-- Finanzas Familiares - correccion: tercera opcion de presupuesto
-- "usar el gasto real del mes" (sin tener que fijar $ ni %)
-- Ejecutar una vez en Supabase > SQL Editor > New query
-- ============================================================

alter type tipo_tope add value if not exists 'REAL';

create or replace view v_presupuesto_mes as
select p.periodo,
       c.nombre as categoria,
       p.tipo,
       p.valor,
       case when p.tipo = 'FIJO' then p.valor
            when p.tipo = 'REAL' then coalesce(g.gastado, 0)
            else round(p.valor * coalesce(r.ingreso_recurrente, 0) / 1000) * 1000 end as tope,
       coalesce(g.gastado, 0) as gastado
from presupuestos p
join categorias c on c.id = p.categoria_id
left join v_resumen_mensual r on r.periodo = p.periodo
left join (
  select categoria_id, periodo_devengado, sum(monto) as gastado
  from v_movimientos where tipo_flujo = 'GASTO' group by 1, 2
) g on g.categoria_id = p.categoria_id and g.periodo_devengado = p.periodo;
