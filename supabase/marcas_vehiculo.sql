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
