-- ============================================================================
-- Productividad: repartir el monto de los trabajos YA guardados
--
-- Antes, si varias personas hacían la misma área de una orden, cada una quedaba
-- con el monto completo. Ahora se reparte en partes iguales (2 personas = la
-- mitad cada una, 3 = un tercio). La Pizarra ya guarda así los trabajos nuevos;
-- este script corrige los anteriores para que todo el historial use la misma regla.
--
-- Qué hace (por cada orden y área):
--   participacion  = 1 / cantidad de personas
--   monto_asignado = monto_area / cantidad de personas
--   El sobrante de redondeo (céntimos) se le suma a una persona, para que la
--   suma de las partes dé exacto el monto del área.
--
-- Los trabajos hechos por una sola persona no cambian.
-- Es seguro ejecutarlo más de una vez (siempre recalcula desde monto_area).
-- Cómo ejecutarlo: Supabase > SQL Editor > New query > pegar todo > Run.
-- ============================================================================

with grupos as (
    select
        id,
        monto_area,
        count(*)     over (partition by orden_id, area)                 as n,
        row_number() over (partition by orden_id, area order by id)     as pos
    from public.orden_trabajos
),
calculo as (
    select
        id,
        n,
        floor(monto_area * 100 / n) / 100                               as parte,
        monto_area - (floor(monto_area * 100 / n) / 100) * n            as sobrante,
        pos
    from grupos
)
update public.orden_trabajos t
set participacion  = round(1.0 / c.n, 4),
    monto_asignado = c.parte + case when c.pos = 1 then c.sobrante else 0 end
from calculo c
where t.id = c.id;

-- Revisión: la suma de lo asignado debe ser igual al monto de cada área
-- (esta consulta no debería devolver filas)
select orden_id, area, max(monto_area) as monto_area, sum(monto_asignado) as suma_asignada
from public.orden_trabajos
group by orden_id, area
having sum(monto_asignado) <> max(monto_area);
