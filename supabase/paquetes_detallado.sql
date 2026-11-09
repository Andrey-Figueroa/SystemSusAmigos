-- ============================================================================
-- Configuración > Paquetes de detallado (Clásico, Premium, Gold, ...)
--
-- Tablas:
--   detalladores_internos           Opciones de detallador interior (Nize, Trapo húmedo,
--                                   Mate, Brillante...): nombre, activo, Local, Domicilio.
--   aromatizantes                   Aromas (Limón, Frutos rojos...): nombre, activo, Local, Domicilio.
--                                   "Sin aromatizante" no se guarda: siempre sale como opción fija.
--   paquetes_detallado              Nombre, disponible en Local/Domicilio, si lleva IVA.
--   paquete_detallado_precios       Tipos de vehículo en que está disponible y su precio.
--   paquete_detallado_detalladores  Detalladores internos disponibles para el paquete.
--   paquete_detallado_aromatizantes Aromatizantes disponibles para el paquete.
--
-- Requiere que ya exista tipos_vehiculo (supabase/tipos_vehiculo.sql).
-- Cómo ejecutarlo: Supabase > SQL Editor > New query > pegar todo > Run.
-- Es seguro ejecutarlo más de una vez.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Detalladores internos
-- ---------------------------------------------------------------------------
create table if not exists public.detalladores_internos (
    id         bigint generated always as identity primary key,
    nombre     text        not null check (length(trim(nombre)) > 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Columnas agregadas después (por si la tabla ya se había creado sin ellas)
alter table public.detalladores_internos add column if not exists activo               boolean not null default true;
alter table public.detalladores_internos add column if not exists disponible_local     boolean not null default true;
alter table public.detalladores_internos add column if not exists disponible_domicilio boolean not null default true;

create unique index if not exists detalladores_internos_nombre_unico
    on public.detalladores_internos (lower(nombre));

-- ---------------------------------------------------------------------------
-- Aromatizantes
-- ---------------------------------------------------------------------------
create table if not exists public.aromatizantes (
    id                   bigint generated always as identity primary key,
    nombre               text        not null check (length(trim(nombre)) > 0),
    activo               boolean     not null default true,
    disponible_local     boolean     not null default true,
    disponible_domicilio boolean     not null default true,
    created_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now()
);

create unique index if not exists aromatizantes_nombre_unico
    on public.aromatizantes (lower(nombre));

-- ---------------------------------------------------------------------------
-- Paquetes de detallado
-- ---------------------------------------------------------------------------
create table if not exists public.paquetes_detallado (
    id                   bigint generated always as identity primary key,
    nombre               text        not null check (length(trim(nombre)) > 0),
    disponible_local     boolean     not null default true,
    disponible_domicilio boolean     not null default true,
    aplica_iva           boolean     not null default false,
    created_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now()
);

comment on column public.paquetes_detallado.aplica_iva is 'Si es true, al precio se le suma el IVA (13 %)';

create unique index if not exists paquetes_detallado_nombre_unico
    on public.paquetes_detallado (lower(nombre));

-- Precio por tipo de vehículo (si un tipo no tiene fila, el paquete no está disponible para él)
create table if not exists public.paquete_detallado_precios (
    paquete_id       bigint not null references public.paquetes_detallado (id) on delete cascade,
    tipo_vehiculo_id bigint not null references public.tipos_vehiculo (id) on delete cascade,
    precio           numeric(12, 2) not null check (precio >= 0),
    primary key (paquete_id, tipo_vehiculo_id)
);

-- Detalladores internos disponibles para cada paquete
create table if not exists public.paquete_detallado_detalladores (
    paquete_id     bigint not null references public.paquetes_detallado (id) on delete cascade,
    detallador_id  bigint not null references public.detalladores_internos (id) on delete cascade,
    primary key (paquete_id, detallador_id)
);

-- Aromatizantes disponibles para cada paquete
create table if not exists public.paquete_detallado_aromatizantes (
    paquete_id      bigint not null references public.paquetes_detallado (id) on delete cascade,
    aromatizante_id bigint not null references public.aromatizantes (id) on delete cascade,
    primary key (paquete_id, aromatizante_id)
);

-- ---------------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists detalladores_internos_updated_at on public.detalladores_internos;
create trigger detalladores_internos_updated_at
    before update on public.detalladores_internos
    for each row execute function public.set_updated_at();

drop trigger if exists aromatizantes_updated_at on public.aromatizantes;
create trigger aromatizantes_updated_at
    before update on public.aromatizantes
    for each row execute function public.set_updated_at();

drop trigger if exists paquetes_detallado_updated_at on public.paquetes_detallado;
create trigger paquetes_detallado_updated_at
    before update on public.paquetes_detallado
    for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Permisos: solo usuarios con sesión iniciada.
-- Todas: leer, crear, editar y eliminar (eliminar se usa desde Configuración
-- y al desmarcar un vehículo, detallador o aromatizante de un paquete).
-- ---------------------------------------------------------------------------
do $$
declare
    t text;
begin
    foreach t in array array['detalladores_internos', 'aromatizantes', 'paquetes_detallado',
                             'paquete_detallado_precios', 'paquete_detallado_detalladores',
                             'paquete_detallado_aromatizantes'] loop
        execute format('revoke all on public.%I from anon', t);
        execute format('alter table public.%I enable row level security', t);

        execute format('drop policy if exists %I on public.%I', t || '_leer', t);
        execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_leer', t);
        execute format('drop policy if exists %I on public.%I', t || '_crear', t);
        execute format('create policy %I on public.%I for insert to authenticated with check (true)', t || '_crear', t);
        execute format('drop policy if exists %I on public.%I', t || '_editar', t);
        execute format('create policy %I on public.%I for update to authenticated using (true) with check (true)', t || '_editar', t);
    end loop;

    -- Principales: con borrar (botón eliminar de Configuración)
    foreach t in array array['detalladores_internos', 'aromatizantes', 'paquetes_detallado'] loop
        execute format('grant select, insert, update, delete on public.%I to authenticated', t);
        execute format('drop policy if exists %I on public.%I', t || '_borrar', t);
        execute format('create policy %I on public.%I for delete to authenticated using (true)', t || '_borrar', t);
    end loop;

    -- Relaciones: con borrar
    foreach t in array array['paquete_detallado_precios', 'paquete_detallado_detalladores',
                             'paquete_detallado_aromatizantes'] loop
        execute format('grant select, insert, update, delete on public.%I to authenticated', t);
        execute format('drop policy if exists %I on public.%I', t || '_borrar', t);
        execute format('create policy %I on public.%I for delete to authenticated using (true)', t || '_borrar', t);
    end loop;
end
$$;

grant usage, select on all sequences in schema public to authenticated;
