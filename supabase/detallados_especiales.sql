-- ============================================================================
-- Configuración > Detallados especiales (Pulido de vidrios, Lavado de motor, ...)
--
-- Tablas:
--   detallados_especiales          Nombre, disponible en Local / Domicilio, si lleva IVA.
--   detallado_especial_precios     Precio por tipo de vehículo. Si un tipo no tiene
--                                  precio, el detallado no sale para ese vehículo.
--
-- Requiere que ya exista tipos_vehiculo (supabase/tipos_vehiculo.sql).
-- No se cargan datos: los detallados se crean desde Configuración.
-- Cómo ejecutarlo: Supabase > SQL Editor > New query > pegar todo > Run.
-- Es seguro ejecutarlo más de una vez.
-- ============================================================================

create table if not exists public.detallados_especiales (
    id                   bigint generated always as identity primary key,
    nombre               text        not null check (length(trim(nombre)) > 0),
    disponible_local     boolean     not null default true,
    disponible_domicilio boolean     not null default true,
    aplica_iva           boolean     not null default false,
    created_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now()
);

-- IVA (agregado después: se crea si la tabla ya existía)
alter table public.detallados_especiales add column if not exists aplica_iva boolean not null default false;
comment on column public.detallados_especiales.aplica_iva is 'Si es true, al precio se le suma el IVA (13 %)';

create unique index if not exists detallados_especiales_nombre_unico
    on public.detallados_especiales (lower(nombre));

create table if not exists public.detallado_especial_precios (
    especial_id      bigint not null references public.detallados_especiales (id) on delete cascade,
    tipo_vehiculo_id bigint not null references public.tipos_vehiculo (id) on delete cascade,
    precio           numeric(12, 2) not null check (precio >= 0),
    primary key (especial_id, tipo_vehiculo_id)
);

-- updated_at automático
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists detallados_especiales_updated_at on public.detallados_especiales;
create trigger detallados_especiales_updated_at
    before update on public.detallados_especiales
    for each row execute function public.set_updated_at();

-- Permisos: solo usuarios con sesión iniciada; leer, crear, editar y eliminar
do $$
declare
    t text;
begin
    foreach t in array array['detallados_especiales', 'detallado_especial_precios'] loop
        execute format('revoke all on public.%I from anon', t);
        execute format('grant select, insert, update, delete on public.%I to authenticated', t);
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

grant usage, select on all sequences in schema public to authenticated;
