-- ============================================================================
-- Permisos de las tablas de Configuración (tipos_vehiculo)
--
-- Arregla el error 403 al guardar desde Configuración: las tablas nuevas quedan
-- bloqueadas para la app hasta que se les dan permisos.
-- Acceso: solo usuarios con sesión iniciada (authenticated) pueden leer, crear
-- editar y eliminar.
--
-- Cómo ejecutarlo: Supabase > SQL Editor > New query > pegar todo > Run.
-- Es seguro ejecutarlo más de una vez. Si la tabla aún no existe,
-- esa parte se salta sola.
-- ============================================================================

do $$
declare
    t text;
begin
    foreach t in array array['tipos_vehiculo'] loop
        if to_regclass('public.' || t) is null then
            raise notice 'La tabla % no existe todavía: se omite.', t;
            continue;
        end if;

        -- Permisos de la tabla: leer, crear, editar y eliminar
        execute format('grant select, insert, update, delete on public.%I to authenticated', t);
        execute format('revoke all on public.%I from anon', t);

        -- Seguridad por filas: solo con sesión iniciada
        execute format('alter table public.%I enable row level security', t);

        execute format('drop policy if exists %I on public.%I', t || '_leer', t);
        execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_leer', t);

        execute format('drop policy if exists %I on public.%I', t || '_crear', t);
        execute format('create policy %I on public.%I for insert to authenticated with check (true)', t || '_crear', t);

        execute format('drop policy if exists %I on public.%I', t || '_editar', t);
        execute format('create policy %I on public.%I for update to authenticated using (true) with check (true)', t || '_editar', t);

        execute format('drop policy if exists %I on public.%I', t || '_borrar', t);
        execute format('create policy %I on public.%I for delete to authenticated using (true)', t || '_borrar', t);
    end loop;
end
$$;

-- Las columnas id usan identidad: permitir generar el siguiente número
grant usage, select on all sequences in schema public to authenticated;
