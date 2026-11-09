-- ============================================================================
-- Configuración > Extras (extras finales: Cera premium, Anti empañante, ...)
--
-- Son los únicos extras que salen en Vender / Atender (Local y Domicilio).
-- "Ninguno" no se guarda: siempre sale como opción fija.
--
-- Columnas:
--   nombre               Nombre del extra (no se repite)
--   activo               Si sale o no (no se borran, se desactivan)
--   disponible_local     Sale en Local Comercial
--   disponible_domicilio Sale en Domicilio
--   solo_con_interior    Solo para vehículos con interior (p. ej. no sale en Moto)
--   precio               Precio aproximado en colones (opcional, de referencia)
--
-- Cómo ejecutarlo: Supabase > SQL Editor > New query > pegar todo > Run.
-- Es seguro ejecutarlo más de una vez.
-- ============================================================================

create table if not exists public.extras (
    id                   bigint generated always as identity primary key,
    nombre               text        not null check (length(trim(nombre)) > 0),
    activo               boolean     not null default true,
    disponible_local     boolean     not null default true,
    disponible_domicilio boolean     not null default true,
    solo_con_interior    boolean     not null default false,
    created_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now()
);

-- Precio aproximado (agregado después: se crea si la tabla ya existía)
alter table public.extras add column if not exists precio numeric(12, 2) check (precio is null or precio >= 0);

create unique index if not exists extras_nombre_unico
    on public.extras (lower(nombre));

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

drop trigger if exists extras_updated_at on public.extras;
create trigger extras_updated_at
    before update on public.extras
    for each row execute function public.set_updated_at();

-- Extras que ya se usaban (si ya existen, no se duplican)
insert into public.extras (nombre, solo_con_interior) values
    ('Cera premium',             false),
    ('Protector de interior',    true),
    ('Protector de asientos',    true),
    ('Anti empañante',           false),
    ('Repelente de vidrios',     false),
    ('Sellador cerámico',        false),
    ('Partes negras exteriores', false)
on conflict do nothing;

-- Permisos: solo usuarios con sesión iniciada; leer, crear, editar y eliminar
revoke all on public.extras from anon;
grant select, insert, update, delete on public.extras to authenticated;

alter table public.extras enable row level security;

drop policy if exists extras_leer on public.extras;
create policy extras_leer on public.extras for select to authenticated using (true);

drop policy if exists extras_crear on public.extras;
create policy extras_crear on public.extras for insert to authenticated with check (true);

drop policy if exists extras_editar on public.extras;
create policy extras_editar on public.extras for update to authenticated using (true) with check (true);

drop policy if exists extras_borrar on public.extras;
create policy extras_borrar on public.extras for delete to authenticated using (true);

grant usage, select on all sequences in schema public to authenticated;
