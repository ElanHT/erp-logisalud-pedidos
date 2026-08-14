-- Vista previa de la reconciliación del catálogo contra NubeFact (0052).
--
-- SOLO LECTURA: no escribe nada. Correla en el SQL Editor del dashboard de
-- Supabase ANTES de mergear, para ver el reporte contra los datos reales y
-- decidir con eso a la vista.
--
-- La migración 0052 hace exactamente estos mismos matches; esto solo los
-- muestra.

-- Paso 1: cargar el catálogo en una tabla temporal.
-- Copiá el bloque `create temporary table _nubefact_catalogo ... insert into
-- ... values (...)` desde
-- supabase/migrations/0052_reconciliar_catalogo_nubefact.sql
-- y pegalo acá arriba antes de correr lo de abajo.

-- ---------------------------------------------------------------------------
-- A) Resumen
-- ---------------------------------------------------------------------------
with excepcion(codigo) as (
  values ('DHP100'),('DHP101'),('DHP102'),('DHP105'),('DHP106'),
         ('BODHP100'),('BODHP101'),('BODHP102'),('BODHP105'),('BODHP106')
),
match as (
  select n.codigo, n.descripcion as desc_nubefact, n.afectacion,
         p.id as product_id, p.descripcion as desc_actual,
         t.afectacion_tributaria as afect_actual, t.tasa_aplicable as tasa_actual,
         case n.afectacion when '10' then 'GRAVADO' else 'INAFECTO' end as afect_nueva,
         case n.afectacion when '10' then 18.00 else 0.00 end as tasa_nueva,
         (n.codigo in (select codigo from excepcion)) as es_excepcion
  from _nubefact_catalogo n
  left join pedidos.products p on upper(btrim(p.codigo_interno)) = n.codigo
  left join pedidos.product_tax_profiles t
    on t.product_id = p.id and t.vigente_hasta is null
)
select
  (select count(*) from _nubefact_catalogo)                            as codigos_en_catalogo,
  count(*) filter (where product_id is null)                           as sin_match_en_products,
  count(*) filter (where product_id is not null
                     and desc_actual is distinct from desc_nubefact)   as cambian_descripcion,
  count(*) filter (where product_id is not null and not es_excepcion
                     and (afect_actual is distinct from afect_nueva
                       or tasa_actual  is distinct from tasa_nueva))   as cambian_afectacion,
  count(*) filter (where product_id is not null and es_excepcion)      as protegidos_por_excepcion,
  count(*) filter (where product_id is not null and afect_actual is null)
                                                                       as sin_perfil_tributario_vigente
from match;

-- ---------------------------------------------------------------------------
-- B) Detalle: qué productos cambian de afectación tributaria
--    (esto es lo que conviene revisar producto por producto)
-- ---------------------------------------------------------------------------
-- Repetí el CTE `excepcion` y `match` de arriba y después:
--
-- select codigo, desc_nubefact, afect_actual, tasa_actual, afect_nueva, tasa_nueva
-- from match
-- where product_id is not null and not es_excepcion
--   and (afect_actual is distinct from afect_nueva
--     or tasa_actual  is distinct from tasa_nueva)
-- order by codigo;

-- ---------------------------------------------------------------------------
-- C) Detalle: códigos del catálogo que NO existen en products
-- ---------------------------------------------------------------------------
-- select codigo, desc_nubefact from match where product_id is null order by codigo;

-- ---------------------------------------------------------------------------
-- D) Al revés: productos nuestros que NO están en el catálogo de NubeFact.
--    No los toca la migración, pero conviene saber que existen: no se van a
--    poder facturar hasta que se creen en NubeFact.
-- ---------------------------------------------------------------------------
-- select p.codigo_interno, p.descripcion, p.estado
-- from pedidos.products p
-- where not exists (select 1 from _nubefact_catalogo n
--                   where n.codigo = upper(btrim(p.codigo_interno)))
-- order by p.codigo_interno;
