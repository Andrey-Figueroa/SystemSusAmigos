-- ============================================================================
-- Permanencia de datos: quitar el borrado diario del Cierre de Operaciones
--
-- Antes, el Cierre llamaba a reiniciar_contadores_diarios(), que hacía:
--     TRUNCATE ordenes, ordenes_domicilio, ventas_productos_diarias, gastos
--     RESTART IDENTITY CASCADE
-- Es decir: borraba todo lo del día, reiniciaba los números a 1 y, por el CASCADE,
-- también vaciaba toda tabla ligada a esas (por ejemplo orden_trabajos = Productividad).
--
-- El Cierre ya no la llama (cierre/app.js). Este script la elimina de la base para
-- que nadie pueda ejecutarla por error.
--
-- IMPORTANTE: ejecutarlo DESPUÉS de publicar el cambio de cierre/app.js. Si se
-- ejecuta antes, el Cierre publicado (versión vieja) daría error al cerrar.
--
-- Cómo ejecutarlo: Supabase > SQL Editor > New query > pegar todo > Run.
-- ============================================================================

-- 1) Revisión: qué tablas estaban siendo vaciadas también por el CASCADE
--    (las que tienen una llave foránea hacia las 4 tablas del día).
select
    conrelid::regclass  as tabla_que_tambien_se_vaciaba,
    confrelid::regclass as ligada_a
from pg_constraint
where contype = 'f'
  and confrelid in (
      'public.ordenes'::regclass,
      'public.ordenes_domicilio'::regclass,
      'public.ventas_productos_diarias'::regclass,
      'public.gastos'::regclass
  )
order by 2, 1;

-- 2) Eliminar la función que borraba los datos
drop function if exists public.reiniciar_contadores_diarios();
