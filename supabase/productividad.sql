-- ============================================================================
-- Productividad por empleado: quién realizó cada trabajo
--
-- Se llena desde la Pizarra al pasar una orden a "Terminado":
--   - Una fila por persona y por área (detallado / mecánica).
--   - Si alguien hizo detallado Y mecánica en la misma orden, tiene dos filas.
--   - Si varias personas hicieron la misma área, el monto se REPARTE en partes
--     iguales: participacion = 1/N y monto_asignado = monto_area / N.
--     (Para corregir trabajos guardados antes de este cambio: productividad_reparto.sql)
--   - El tiempo es APROXIMADO: desde que entró la orden hasta que se terminó,
--     compartido por las áreas de la orden.
--   - 'detalle' guarda una foto de lo realizado (paquete, especiales, categorías
--     de mecánica...), para que cambios futuros en Configuración no alteren el historial.
--
-- Cómo ejecutarlo: Supabase > SQL Editor > New query > pegar todo > Run.
-- Es seguro ejecutarlo más de una vez.
-- ============================================================================

create table if not exists public.orden_trabajos (
    id              bigint generated always as identity primary key,
    orden_id        bigint      not null references public.ordenes (id) on delete cascade,
    area            text        not null check (area in ('detallado', 'mecanica')),
    personal_id     text,
    personal_nombre text        not null check (length(trim(personal_nombre)) > 0),
    participacion   numeric(5, 4) not null default 1 check (participacion > 0 and participacion <= 1),
    monto_area      numeric(12, 2) not null default 0,   -- monto del área en la orden
    monto_asignado  numeric(12, 2) not null default 0,   -- monto que se le acredita (= monto_area / N)
    inicio_at       timestamptz,                         -- entrada de la orden
    fin_at          timestamptz not null default now(),  -- cuando se pasó a Terminado
    minutos         integer,                             -- duración aproximada
    tipo_vehiculo   text,
    detalle         jsonb,
    registrado_por  text,
    created_at      timestamptz not null default now()
);

comment on table public.orden_trabajos is 'Quién realizó cada área de una orden (Pizarra > Terminado). Base del módulo de Productividad.';

create index if not exists orden_trabajos_orden_idx    on public.orden_trabajos (orden_id);
create index if not exists orden_trabajos_personal_idx on public.orden_trabajos (personal_id);
create index if not exists orden_trabajos_fin_idx      on public.orden_trabajos (fin_at);

-- Permisos: solo usuarios con sesión iniciada
revoke all on public.orden_trabajos from anon;
grant select, insert, update, delete on public.orden_trabajos to authenticated;
alter table public.orden_trabajos enable row level security;

drop policy if exists orden_trabajos_leer on public.orden_trabajos;
create policy orden_trabajos_leer on public.orden_trabajos for select to authenticated using (true);
drop policy if exists orden_trabajos_crear on public.orden_trabajos;
create policy orden_trabajos_crear on public.orden_trabajos for insert to authenticated with check (true);
drop policy if exists orden_trabajos_editar on public.orden_trabajos;
create policy orden_trabajos_editar on public.orden_trabajos for update to authenticated using (true) with check (true);
drop policy if exists orden_trabajos_borrar on public.orden_trabajos;
create policy orden_trabajos_borrar on public.orden_trabajos for delete to authenticated using (true);

grant usage, select on all sequences in schema public to authenticated;
