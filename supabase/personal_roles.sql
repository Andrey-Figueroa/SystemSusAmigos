-- ============================================================================
-- Personal: varios roles por persona
--
-- Agrega la columna 'roles' (lista) a la tabla 'personal'.
-- La columna 'rol' se mantiene con el rol PRINCIPAL (el de más permisos), así
-- todo lo que ya usa 'rol' sigue funcionando. Los permisos de acceso a módulos
-- se calculan con todos los roles (basta con que alguno lo permita).
--
-- Cómo ejecutarlo: Supabase > SQL Editor > New query > pegar todo > Run.
-- Es seguro ejecutarlo más de una vez.
-- ============================================================================

alter table public.personal add column if not exists roles text[];

comment on column public.personal.roles is 'Todos los roles de la persona. ''rol'' guarda el principal (el de más permisos).';

-- Quien aún no tiene lista de roles queda con su rol actual
update public.personal
set roles = array[rol]
where (roles is null or cardinality(roles) = 0)
  and rol is not null;
