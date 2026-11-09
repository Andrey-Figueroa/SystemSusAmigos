-- ============================================================================
-- Permite ELIMINAR desde Configuración (botón de basurero).
--
-- Tablas: tipos_vehiculo, paquetes_detallado, detalladores_internos, detallados_especiales,
--         aromatizantes, extras.
-- Solo usuarios con sesión iniciada. Al eliminar:
--   - un paquete: se borran también sus precios y asignaciones;
--   - un tipo de vehículo / detallador / aromatizante: se quita de los paquetes.
-- Las órdenes ya registradas no cambian (guardan el nombre como texto).
--
-- Cómo ejecutarlo: Supabase > SQL Editor > New query > pegar todo > Run.
-- Es seguro ejecutarlo más de una vez; si una tabla no existe, se omite.
-- ============================================================================

do $$
declare
    t text;
begin
    foreach t in array array['tipos_vehiculo', 'paquetes_detallado', 'detalladores_internos',
                             'aromatizantes', 'extras', 'detallados_especiales'] loop
        if to_regclass('public.' || t) is null then
            raise notice 'La tabla % no existe todavía: se omite.', t;
            continue;
        end if;
        execute format('grant delete on public.%I to authenticated', t);
        execute format('drop policy if exists %I on public.%I', t || '_borrar', t);
        execute format('create policy %I on public.%I for delete to authenticated using (true)', t || '_borrar', t);
    end loop;
end
$$;
