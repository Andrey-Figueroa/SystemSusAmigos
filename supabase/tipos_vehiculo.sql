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
