-- ============================================================================
-- Última visita de vehículos y clientes (automática)
--
-- Antes: clientes.ultima_visita existía pero NADIE la actualizaba (siempre null)
-- y vehiculos no tenía esa columna.
--
-- Ahora, cada vez que se inserta una orden:
--   - Local Comercial (tabla ordenes): actualiza la última visita del VEHÍCULO
--     (por vehiculo_id, o por placa si no viene el id) y del CLIENTE.
--   - Domicilio (tabla ordenes_domicilio): actualiza la del CLIENTE, y la del
--     vehículo solo si trae una placa real (Domicilio usa "SIN PLACA").
-- Lo hace la base de datos (trigger), así funciona desde cualquier pantalla.
-- Nunca retrocede la fecha: se queda con la más reciente.
--
-- Al ejecutarlo también se llenan las fechas con lo que ya existe:
--   la orden más reciente de cada vehículo/cliente; si no tiene órdenes, la
--   fecha en que se registró (registrarlo implica que vino ese día).
--
-- Cómo ejecutarlo: Supabase > SQL Editor > New query > pegar todo > Run.
-- Es seguro ejecutarlo más de una vez.
-- ============================================================================

alter table public.vehiculos add column if not exists ultima_visita timestamptz;
comment on column public.vehiculos.ultima_visita is 'Última vez que vino (se actualiza sola al crear una orden)';

create index if not exists vehiculos_ultima_visita_idx on public.vehiculos (ultima_visita);
create index if not exists clientes_ultima_visita_idx on public.clientes (ultima_visita);

-- ---------------------------------------------------------------------------
-- Funciones de los triggers
-- ---------------------------------------------------------------------------
create or replace function public.registrar_visita_orden()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    fecha timestamptz := coalesce(new.created_at, now());
begin
    -- Vehículo
    if new.vehiculo_id is not null then
        update vehiculos
           set ultima_visita = greatest(coalesce(ultima_visita, fecha), fecha)
         where id = new.vehiculo_id;
    elsif coalesce(trim(new.placa), '') not in ('', 'SIN PLACA') then
        update vehiculos
           set ultima_visita = greatest(coalesce(ultima_visita, fecha), fecha)
         where upper(placa) = upper(trim(new.placa));
    end if;

    -- Cliente
    if new.cliente_id is not null then
        update clientes
           set ultima_visita = greatest(coalesce(ultima_visita, fecha), fecha)
         where id = new.cliente_id;
    end if;

    return new;
end;
$$;

create or replace function public.registrar_visita_domicilio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    fecha timestamptz := coalesce(new.created_at, now());
begin
    if coalesce(trim(new.placa), '') not in ('', 'SIN PLACA') then
        update vehiculos
           set ultima_visita = greatest(coalesce(ultima_visita, fecha), fecha)
         where upper(placa) = upper(trim(new.placa));
    end if;

    if new.cliente_id is not null then
        update clientes
           set ultima_visita = greatest(coalesce(ultima_visita, fecha), fecha)
         where id = new.cliente_id;
    end if;

    return new;
end;
$$;

drop trigger if exists ordenes_registrar_visita on public.ordenes;
create trigger ordenes_registrar_visita
    after insert on public.ordenes
    for each row execute function public.registrar_visita_orden();

drop trigger if exists ordenes_domicilio_registrar_visita on public.ordenes_domicilio;
create trigger ordenes_domicilio_registrar_visita
    after insert on public.ordenes_domicilio
    for each row execute function public.registrar_visita_domicilio();

-- ---------------------------------------------------------------------------
-- Llenar con lo que ya existe
-- ---------------------------------------------------------------------------
-- Vehículos: orden más reciente (por id o por placa)
update public.vehiculos v
   set ultima_visita = greatest(coalesce(v.ultima_visita, x.ultima), x.ultima)
  from (
        select v2.id, max(o.created_at) as ultima
          from public.vehiculos v2
          join public.ordenes o
            on o.vehiculo_id = v2.id
            or (o.vehiculo_id is null and upper(o.placa) = upper(v2.placa))
         group by v2.id
       ) x
 where v.id = x.id;

-- Clientes: orden más reciente de Local o Domicilio
update public.clientes c
   set ultima_visita = greatest(coalesce(c.ultima_visita, x.ultima), x.ultima)
  from (
        select cliente_id, max(created_at) as ultima
          from (
                select cliente_id, created_at from public.ordenes where cliente_id is not null
                union all
                select cliente_id, created_at from public.ordenes_domicilio where cliente_id is not null
               ) t
         group by cliente_id
       ) x
 where c.id = x.cliente_id;

-- Sin órdenes: la fecha en que se registraron
update public.vehiculos set ultima_visita = created_at where ultima_visita is null;
update public.clientes  set ultima_visita = created_at where ultima_visita is null;
