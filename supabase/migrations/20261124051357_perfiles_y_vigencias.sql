-- =============================================================================
-- Fase 1 · Migración 2: perfiles, coordinaciones y asignaciones con vigencia.
-- RF-04, RF-05, RF-08, RF-09, S-04, S-06, ADR-04, ADR-05, ADR-08, ADR-09.
-- Decisiones del equipo: un recinto vigente por coordinador; pertenencia del
-- veedor al recinto en `veedores_recinto`; jurisdicción provincial con vigencia.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Reglas puras en SQL. DEBEN coincidir con src/domain/rules/*.ts
-- -----------------------------------------------------------------------------

-- Cédula: 10 dígitos, provincia 01–24, tercer dígito < 6, módulo 10.
-- Igual a src/domain/rules/cedula.mod10.ts
create function private.cedula_valida(cedula text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  coeficientes constant int[] := array[2, 1, 2, 1, 2, 1, 2, 1, 2];
  suma int := 0;
  producto int;
  provincia int;
begin
  if cedula is null or cedula !~ '^[0-9]{10}$' then
    return false;
  end if;
  provincia := substr(cedula, 1, 2)::int;
  if provincia < 1 or provincia > 24 then
    return false;
  end if;
  if substr(cedula, 3, 1)::int >= 6 then
    return false;
  end if;
  for i in 1..9 loop
    producto := substr(cedula, i, 1)::int * coeficientes[i];
    suma := suma + case when producto > 9 then producto - 9 else producto end;
  end loop;
  return (10 - suma % 10) % 10 = substr(cedula, 10, 1)::int;
end;
$$;

-- Nombres y apellidos: letras Unicode (NFC), espacios simples y guiones, 2–60.
-- Igual a PATRON_NOMBRE + normalizarNombre de src/domain/rules/perfil.rules.ts
create function private.nombre_valido(nombre text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select nombre is not null
     and nombre is nfc normalized
     and nombre = btrim(regexp_replace(nombre, '\s+', ' ', 'g'))
     and char_length(nombre) between 2 and 60
     and nombre ~ '^[[:alpha:]]([[:alpha:] -]*[[:alpha:]])?$';
$$;

-- -----------------------------------------------------------------------------
-- 2. Perfiles (1:1 con auth.users).
-- -----------------------------------------------------------------------------
create table public.perfiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  cedula             char(10) not null unique
                       constraint perfiles_cedula_ck check (private.cedula_valida(cedula)),
  nombres            text not null constraint perfiles_nombres_ck check (private.nombre_valido(nombres)),
  apellidos          text not null constraint perfiles_apellidos_ck check (private.nombre_valido(apellidos)),
  telefono           text not null constraint perfiles_telefono_ck check (telefono ~ '^09[0-9]{8}$'),
  -- Mismo patrón que z.email() de Zod 4, en minúsculas.
  correo             text not null unique constraint perfiles_correo_ck check (
                       correo = lower(correo) and
                       correo ~ '^(?:[a-z0-9_''+\-]+\.)*[a-z0-9_''+\-]*[a-z0-9_+-]@(?:[a-z0-9][a-z0-9\-]*\.)+[a-z]{2,}$'
                     ),
  rol                text not null check (rol in ('coordinador_provincial', 'coordinador_recinto', 'veedor')),
  activo             boolean not null default true,
  debe_cambiar_clave boolean not null default true,
  correo_verificado  boolean not null default false,
  creado_por         uuid references public.perfiles (id),
  creado_en          timestamptz not null default now()
);
create index perfiles_creado_por_idx on public.perfiles (creado_por);

alter table public.recintos
  add constraint recintos_creado_por_fk foreign key (creado_por) references public.perfiles (id);
create index recintos_creado_por_idx on public.recintos (creado_por);

-- Verifica el rol de una persona al vincularla (ADR-08, ADR-09).
create function private.exigir_rol(perfil_id uuid, rol_esperado text)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not exists (select 1 from public.perfiles p where p.id = perfil_id and p.rol = rol_esperado) then
    raise exception 'La persona % no tiene el rol %', perfil_id, rol_esperado
      using errcode = 'check_violation', hint = 'rol_incorrecto';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Tablas con vigencia (desde / hasta). hasta IS NULL = vigente.
-- -----------------------------------------------------------------------------

-- Jurisdicción del coordinador provincial.
create table public.coordinaciones_provinciales (
  id             uuid primary key default gen_random_uuid(),
  coordinador_id uuid not null references public.perfiles (id),
  provincia_id   smallint not null references public.provincias (id),
  asignado_por   uuid references public.perfiles (id),   -- null: alta inicial por script
  desde          timestamptz not null default now(),
  hasta          timestamptz,
  check (hasta is null or hasta >= desde)
);
create index coord_prov_vigente_idx on public.coordinaciones_provinciales (coordinador_id, provincia_id) where hasta is null;
create index coord_prov_provincia_idx on public.coordinaciones_provinciales (provincia_id);
create index coord_prov_asignado_por_idx on public.coordinaciones_provinciales (asignado_por);

-- Coordinador de recinto: uno vigente por recinto y un recinto vigente por coordinador.
create table public.coordinaciones_recinto (
  id             uuid primary key default gen_random_uuid(),
  recinto_id     uuid not null references public.recintos (id),
  coordinador_id uuid not null references public.perfiles (id),
  asignado_por   uuid not null references public.perfiles (id),
  desde          timestamptz not null default now(),
  hasta          timestamptz,
  check (hasta is null or hasta >= desde)
);
create unique index coord_recinto_recinto_vigente_uk on public.coordinaciones_recinto (recinto_id) where hasta is null;
create unique index coord_recinto_coordinador_vigente_uk on public.coordinaciones_recinto (coordinador_id) where hasta is null;
create index coord_recinto_recinto_idx on public.coordinaciones_recinto (recinto_id);
create index coord_recinto_coordinador_idx on public.coordinaciones_recinto (coordinador_id);
create index coord_recinto_asignado_por_idx on public.coordinaciones_recinto (asignado_por);

-- Veedores registrados en un recinto (S-06): pueden asignarse o reemplazar ahí.
create table public.veedores_recinto (
  id             uuid primary key default gen_random_uuid(),
  veedor_id      uuid not null references public.perfiles (id),
  recinto_id     uuid not null references public.recintos (id),
  registrado_por uuid not null references public.perfiles (id),
  desde          timestamptz not null default now(),
  hasta          timestamptz,
  check (hasta is null or hasta >= desde)
);
create unique index veedores_recinto_veedor_vigente_uk on public.veedores_recinto (veedor_id) where hasta is null;
create index veedores_recinto_recinto_vigente_idx on public.veedores_recinto (recinto_id) where hasta is null;
create index veedores_recinto_veedor_idx on public.veedores_recinto (veedor_id);
create index veedores_recinto_registrado_por_idx on public.veedores_recinto (registrado_por);

-- Veedor de mesa: uno vigente por mesa y una mesa vigente por veedor (S-04).
create table public.asignaciones_mesa (
  id           uuid primary key default gen_random_uuid(),
  mesa_id      uuid not null references public.mesas (id),
  veedor_id    uuid not null references public.perfiles (id),
  asignado_por uuid not null references public.perfiles (id),
  desde        timestamptz not null default now(),
  hasta        timestamptz,
  check (hasta is null or hasta >= desde)
);
create unique index asignaciones_mesa_mesa_vigente_uk on public.asignaciones_mesa (mesa_id) where hasta is null;
create unique index asignaciones_mesa_veedor_vigente_uk on public.asignaciones_mesa (veedor_id) where hasta is null;
create index asignaciones_mesa_mesa_idx on public.asignaciones_mesa (mesa_id);
create index asignaciones_mesa_veedor_idx on public.asignaciones_mesa (veedor_id);
create index asignaciones_mesa_asignado_por_idx on public.asignaciones_mesa (asignado_por);

-- -----------------------------------------------------------------------------
-- 4. Triggers de rol (ADR-08, ADR-09).
-- -----------------------------------------------------------------------------
create function private.vigencia_exige_rol()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  case tg_table_name
    when 'coordinaciones_provinciales' then perform private.exigir_rol(new.coordinador_id, 'coordinador_provincial');
    when 'coordinaciones_recinto'      then perform private.exigir_rol(new.coordinador_id, 'coordinador_recinto');
    when 'veedores_recinto'            then perform private.exigir_rol(new.veedor_id, 'veedor');
    when 'asignaciones_mesa'           then perform private.exigir_rol(new.veedor_id, 'veedor');
  end case;
  return new;
end;
$$;

create trigger coordinaciones_provinciales_rol before insert or update on public.coordinaciones_provinciales
  for each row execute function private.vigencia_exige_rol();
create trigger coordinaciones_recinto_rol before insert or update on public.coordinaciones_recinto
  for each row execute function private.vigencia_exige_rol();
create trigger veedores_recinto_rol before insert or update on public.veedores_recinto
  for each row execute function private.vigencia_exige_rol();
create trigger asignaciones_mesa_rol before insert or update on public.asignaciones_mesa
  for each row execute function private.vigencia_exige_rol();

-- No se cambia el rol de alguien con vínculos vigentes (rompería los triggers anteriores).
create function private.perfil_rol_sin_vigencias()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.rol is distinct from old.rol and (
       exists (select 1 from public.coordinaciones_provinciales where coordinador_id = old.id and hasta is null)
    or exists (select 1 from public.coordinaciones_recinto      where coordinador_id = old.id and hasta is null)
    or exists (select 1 from public.veedores_recinto            where veedor_id      = old.id and hasta is null)
    or exists (select 1 from public.asignaciones_mesa           where veedor_id      = old.id and hasta is null)
  ) then
    raise exception 'No se puede cambiar el rol: la persona tiene asignaciones vigentes'
      using errcode = 'check_violation', hint = 'rol_con_vigencias';
  end if;
  return new;
end;
$$;

create trigger perfiles_rol_sin_vigencias before update of rol on public.perfiles
  for each row execute function private.perfil_rol_sin_vigencias();

-- -----------------------------------------------------------------------------
-- 5. RLS activado (políticas y GRANT en la Fase 2).
-- -----------------------------------------------------------------------------
alter table public.perfiles                    enable row level security;
alter table public.coordinaciones_provinciales enable row level security;
alter table public.coordinaciones_recinto      enable row level security;
alter table public.veedores_recinto            enable row level security;
alter table public.asignaciones_mesa           enable row level security;

revoke all on public.perfiles, public.coordinaciones_provinciales, public.coordinaciones_recinto,
  public.veedores_recinto, public.asignaciones_mesa from anon, authenticated;
