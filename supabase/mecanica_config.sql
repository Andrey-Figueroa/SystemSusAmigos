-- ============================================================================
-- Configuración > Mecánica (categorías y sus servicios)
--
-- Tablas (en el Supabase PRINCIPAL, el de Local Comercial; no es el del
-- módulo de Mecánica):
--   mecanica_categorias  Llantas, Sistema de frenos, ... Mantenimiento general, Otro.
--                        pide_detalle = true  -> al vender se escribe un detalle (Otro, Promociones).
--                        Sin servicios y sin detalle -> se marca y listo (Mantenimiento general).
--   mecanica_servicios   Servicios de cada categoría (Alineación, Balanceo, ...).
--
-- Sin precios: el monto de mecánica se define al cobrar (varía según daño y repuestos).
-- Las categorías y servicios iniciales solo se cargan si las tablas están vacías,
-- así lo que se elimine desde Configuración no vuelve a aparecer.
--
-- Cómo ejecutarlo: Supabase > SQL Editor > New query > pegar todo > Run.
-- Es seguro ejecutarlo más de una vez.
-- ============================================================================

create table if not exists public.mecanica_categorias (
    id           bigint generated always as identity primary key,
    nombre       text        not null check (length(trim(nombre)) > 0),
    activo       boolean     not null default true,
    pide_detalle boolean     not null default false,
    orden        integer     not null default 0,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

comment on column public.mecanica_categorias.pide_detalle is 'Si es true, al vender se escribe el detalle en vez de elegir servicios';

create unique index if not exists mecanica_categorias_nombre_unico
    on public.mecanica_categorias (lower(nombre));

create table if not exists public.mecanica_servicios (
    id           bigint generated always as identity primary key,
    categoria_id bigint      not null references public.mecanica_categorias (id) on delete cascade,
    nombre       text        not null check (length(trim(nombre)) > 0),
    activo       boolean     not null default true,
    orden        integer     not null default 0,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

create unique index if not exists mecanica_servicios_nombre_unico
    on public.mecanica_servicios (categoria_id, lower(nombre));

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

drop trigger if exists mecanica_categorias_updated_at on public.mecanica_categorias;
create trigger mecanica_categorias_updated_at
    before update on public.mecanica_categorias
    for each row execute function public.set_updated_at();

drop trigger if exists mecanica_servicios_updated_at on public.mecanica_servicios;
create trigger mecanica_servicios_updated_at
    before update on public.mecanica_servicios
    for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Datos iniciales: los mismos que tenía Local Comercial (solo si está vacío)
-- ---------------------------------------------------------------------------
insert into public.mecanica_categorias (nombre, pide_detalle, orden)
select v.nombre, v.pide_detalle, v.orden
from (values
    ('Llantas',                false, 10),
    ('Sistema de frenos',      false, 20),
    ('Lubricación y fluidos',  false, 30),
    ('Motor',                  false, 40),
    ('Sistema eléctrico',      false, 50),
    ('Aire acondicionado',     false, 60),
    ('Mantenimiento general',  false, 70),
    ('Promociones mecánicas',  true,  80),
    ('Otro',                   true,  90)
) as v (nombre, pide_detalle, orden)
where not exists (select 1 from public.mecanica_categorias);

insert into public.mecanica_servicios (categoria_id, nombre, orden)
select c.id, v.nombre, v.orden
from (values
    ('Llantas', 'Rotación de llantas', 10),
    ('Llantas', 'Alineación', 20),
    ('Llantas', 'Balanceo', 30),
    ('Llantas', 'Cambio de llantas', 40),
    ('Llantas', 'Reparación de pinchazos', 50),
    ('Llantas', 'Cambio de válvulas', 60),
    ('Sistema de frenos', 'Cambio de pastillas', 10),
    ('Sistema de frenos', 'Cambio de discos', 20),
    ('Sistema de frenos', 'Purga de líquido de frenos', 30),
    ('Sistema de frenos', 'Revisión de freno de mano', 40),
    ('Lubricación y fluidos', 'Cambio de aceite de motor', 10),
    ('Lubricación y fluidos', 'Cambio de filtro de aceite', 20),
    ('Lubricación y fluidos', 'Cambio de aceite de transmisión', 30),
    ('Lubricación y fluidos', 'Cambio de líquido refrigerante', 40),
    ('Lubricación y fluidos', 'Cambio de líquido de dirección', 50),
    ('Motor', 'Diagnóstico computarizado', 10),
    ('Motor', 'Cambio de bujías', 20),
    ('Motor', 'Cambio de filtro de aire', 30),
    ('Motor', 'Limpieza de inyectores', 40),
    ('Motor', 'Revisión de correa de distribución', 50),
    ('Motor', 'Afinación completa', 60),
    ('Sistema eléctrico', 'Revisión / cambio de batería', 10),
    ('Sistema eléctrico', 'Revisión de alternador', 20),
    ('Sistema eléctrico', 'Cambio de luces / focos', 30),
    ('Sistema eléctrico', 'Revisión del sistema de arranque', 40),
    ('Aire acondicionado', 'Recarga de aire acondicionado', 10),
    ('Aire acondicionado', 'Limpieza de tubería', 20)
) as v (categoria, nombre, orden)
join public.mecanica_categorias c on lower(c.nombre) = lower(v.categoria)
where not exists (select 1 from public.mecanica_servicios);

-- ---------------------------------------------------------------------------
-- Permisos: solo usuarios con sesión iniciada; leer, crear, editar y eliminar
-- ---------------------------------------------------------------------------
do $$
declare
    t text;
begin
    foreach t in array array['mecanica_categorias', 'mecanica_servicios'] loop
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
