-- ############################################################################
-- CONFIGURACIÓN COMPLETA (un solo archivo)
--
-- Crea o actualiza TODO lo del módulo Configuración, en orden:
--   1. Tipos de vehículo
--   2. Permisos de tipos de vehículo
--   3. Paquetes de detallado, detalladores internos y aromatizantes
--   4. Extras (con precio aproximado)
--   5. Detallados especiales (precio por tipo de vehículo e IVA)
--   6. Mecánica (categorías y servicios)
--   7. Marcas de vehículo
--   8. Permiso para eliminar desde Configuración
--
-- Cómo ejecutarlo: Supabase > SQL Editor > New query > pegar TODO > Run.
-- Es seguro ejecutarlo más de una vez: no borra datos que ya existen.
-- ############################################################################



-- ############################################################################
-- Archivo: supabase/tipos_vehiculo.sql
-- ############################################################################

-- ============================================================================
-- Configuración > Tipos de vehículo
-- Tipos de vehículo que se atienden (SUV, Sedán, ...). Se crean y editan desde
-- configuracion/tipos-vehiculo.html
--
-- Cómo ejecutarlo: Supabase > SQL Editor > New query > pegar todo > Run.
-- Es seguro ejecutarlo más de una vez.
-- ============================================================================

create table if not exists public.tipos_vehiculo (
    id                   bigint generated always as identity primary key,
    nombre               text        not null check (length(trim(nombre)) > 0),
    tiene_interior       boolean     not null default true,
    disponible_local     boolean     not null default true,
    disponible_domicilio boolean     not null default true,
    created_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now()
);

comment on table  public.tipos_vehiculo is 'Tipos de vehículo que se atienden (Configuración > Tipos de vehículo)';
comment on column public.tipos_vehiculo.tiene_interior is 'Si es false (p. ej. Moto) se saltan las opciones de interior';

-- No repetir el mismo tipo (sin importar mayúsculas)
create unique index if not exists tipos_vehiculo_nombre_unico
    on public.tipos_vehiculo (lower(nombre));

-- updated_at se actualiza solo al editar
create or replace function public.tipos_vehiculo_set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists tipos_vehiculo_updated_at on public.tipos_vehiculo;
create trigger tipos_vehiculo_updated_at
    before update on public.tipos_vehiculo
    for each row execute function public.tipos_vehiculo_set_updated_at();

-- Nota: igual que el resto de tablas del sistema, esta tabla NO tiene RLS activado.
-- Si más adelante se aplica supabase/seguridad_rls.sql, agregar 'tipos_vehiculo' a su lista.


-- ############################################################################
-- Archivo: supabase/permisos_configuracion.sql
-- ############################################################################

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


-- ############################################################################
-- Archivo: supabase/paquetes_detallado.sql
-- ############################################################################

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


-- ############################################################################
-- Archivo: supabase/extras.sql
-- ############################################################################

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


-- ############################################################################
-- Archivo: supabase/detallados_especiales.sql
-- ############################################################################

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


-- ############################################################################
-- Archivo: supabase/mecanica_config.sql
-- ############################################################################

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


-- ############################################################################
-- Archivo: supabase/marcas_vehiculo.sql
-- ############################################################################

-- ============================================================================
-- Configuración > Marcas de vehículo
--
-- Las marcas que salen en el autocompletado del paso "Vehículo" de Local Comercial.
-- Columnas: nombre (en MAYÚSCULAS, no se repite) y activo.
-- Las marcas iniciales (las que estaban en el código) solo se cargan si la tabla
-- está vacía, así lo que se elimine desde Configuración no vuelve a aparecer.
--
-- Cómo ejecutarlo: Supabase > SQL Editor > New query > pegar todo > Run.
-- Es seguro ejecutarlo más de una vez.
-- ============================================================================

create table if not exists public.marcas_vehiculo (
    id         bigint generated always as identity primary key,
    nombre     text        not null check (length(trim(nombre)) > 0),
    activo     boolean     not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists marcas_vehiculo_nombre_unico
    on public.marcas_vehiculo (lower(nombre));

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

drop trigger if exists marcas_vehiculo_updated_at on public.marcas_vehiculo;
create trigger marcas_vehiculo_updated_at
    before update on public.marcas_vehiculo
    for each row execute function public.set_updated_at();

-- Marcas iniciales (solo si la tabla está vacía)
insert into public.marcas_vehiculo (nombre)
select v.nombre
from (values
    ('TOYOTA'), ('LEXUS'), ('HONDA'), ('ACURA'), ('NISSAN'), ('INFINITI'),
    ('MAZDA'), ('SUBARU'), ('MITSUBISHI'), ('SUZUKI'), ('ISUZU'), ('HYUNDAI'),
    ('KIA'), ('GENESIS'), ('SSANGYONG'), ('FORD'), ('CHEVROLET'), ('GMC'),
    ('CADILLAC'), ('BUICK'), ('JEEP'), ('DODGE'), ('RAM'), ('CHRYSLER'),
    ('TESLA'), ('MERCEDES-BENZ'), ('BMW'), ('MINI'), ('AUDI'), ('VOLKSWAGEN'),
    ('PORSCHE'), ('OPEL'), ('FERRARI'), ('LAMBORGHINI'), ('MASERATI'), ('FIAT'),
    ('ALFA ROMEO'), ('ABARTH'), ('RENAULT'), ('PEUGEOT'), ('CITROËN'), ('DS AUTOMOBILES'),
    ('LAND ROVER'), ('RANGE ROVER'), ('JAGUAR'), ('ASTON MARTIN'), ('BENTLEY'), ('ROLLS-ROYCE'),
    ('MCLAREN'), ('VOLVO'), ('POLESTAR'), ('SEAT'), ('CUPRA'), ('ŠKODA'),
    ('DACIA'), ('BYD'), ('CHERY'), ('GEELY'), ('JETOUR'), ('OMODA'),
    ('JAECOO'), ('JAC'), ('MG'), ('GAC'), ('AION'), ('HAVAL'),
    ('TANK'), ('ORA'), ('WEY'), ('CHANGAN'), ('DONGFENG'), ('BAIC'),
    ('FOTON'), ('MAXUS'), ('KAIYI'), ('FAW'), ('BESTUNE'), ('JMC'),
    ('SERES'), ('NIO'), ('XPENG'), ('ZEEKR'), ('LEAPMOTOR'), ('LI AUTO'), ('TATA'), ('MAHINDRA'), ('VINFAST'), ('YAMAHA'),
    ('KAWASAKI'), ('KTM'), ('FREEDOM'), ('FORMULA'), ('KATANA'), ('SERPENTO'),
    ('OTRA')
) as v (nombre)
where not exists (select 1 from public.marcas_vehiculo);

-- Permisos: solo usuarios con sesión iniciada; leer, crear, editar y eliminar
revoke all on public.marcas_vehiculo from anon;
grant select, insert, update, delete on public.marcas_vehiculo to authenticated;
alter table public.marcas_vehiculo enable row level security;

drop policy if exists marcas_vehiculo_leer on public.marcas_vehiculo;
create policy marcas_vehiculo_leer on public.marcas_vehiculo for select to authenticated using (true);
drop policy if exists marcas_vehiculo_crear on public.marcas_vehiculo;
create policy marcas_vehiculo_crear on public.marcas_vehiculo for insert to authenticated with check (true);
drop policy if exists marcas_vehiculo_editar on public.marcas_vehiculo;
create policy marcas_vehiculo_editar on public.marcas_vehiculo for update to authenticated using (true) with check (true);
drop policy if exists marcas_vehiculo_borrar on public.marcas_vehiculo;
create policy marcas_vehiculo_borrar on public.marcas_vehiculo for delete to authenticated using (true);

grant usage, select on all sequences in schema public to authenticated;


-- ############################################################################
-- Archivo: supabase/permisos_eliminar.sql
-- ############################################################################

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
