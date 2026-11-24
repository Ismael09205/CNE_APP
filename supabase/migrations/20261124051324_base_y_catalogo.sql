-- =============================================================================
-- Fase 1 · Migración 1: permisos por defecto, esquema privado y catálogo.
-- PROJECT_SPEC §3.1, ADR-07, ADR-11. Decisiones del equipo: candidaturas por
-- dignidad (no "5 organizaciones fijas"), mesas por número + sexo, zona/dirección
-- y banderas de acceso/conectividad del distributivo del CNE.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Nada nuevo en `public` queda abierto por defecto.
--    El proyecto aún tenía los privilegios por defecto antiguos (anon y
--    authenticated recibían ALL en cada tabla, secuencia y función nuevas).
--    Cada objeto recibirá solo los GRANT explícitos de la Fase 2 (RLS).
-- -----------------------------------------------------------------------------
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

-- Funciones internas (reglas, triggers, helpers de RLS): fuera de la Data API.
create schema if not exists private;
revoke all on schema private from public, anon;
alter default privileges for role postgres in schema private
  revoke execute on functions from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Catálogo territorial (códigos oficiales del CNE como llave primaria).
-- -----------------------------------------------------------------------------
create table public.provincias (
  id      smallint primary key check (id > 0),
  nombre  text not null unique check (btrim(nombre) <> '')
);

create table public.cantones (
  id           integer primary key check (id > 0),
  provincia_id smallint not null references public.provincias (id),
  nombre       text not null check (btrim(nombre) <> '')
);
create index cantones_provincia_id_idx on public.cantones (provincia_id);

create table public.parroquias (
  id        integer primary key check (id > 0),
  canton_id integer not null references public.cantones (id),
  nombre    text not null check (btrim(nombre) <> '')
);
create index parroquias_canton_id_idx on public.parroquias (canton_id);

create table public.recintos (
  id               uuid primary key default gen_random_uuid(),
  parroquia_id     integer not null references public.parroquias (id),
  codigo           text not null unique check (codigo ~ '^[0-9]+$'),
  nombre           text not null check (btrim(nombre) <> ''),
  codigo_zona      smallint not null check (codigo_zona >= 0),
  nombre_zona      text,
  direccion        text,
  lat              double precision not null check (lat between -90 and 90),
  lng              double precision not null check (lng between -180 and 180),
  dificil_acceso   boolean not null default false,
  sin_conectividad boolean not null default false,
  creado_por       uuid,               -- FK a perfiles en la migración 2
  creado_en        timestamptz not null default now()
);
create index recintos_parroquia_id_idx on public.recintos (parroquia_id);

-- Una mesa = una junta receptora del voto. El CNE numera por sexo.
create table public.mesas (
  id               uuid primary key default gen_random_uuid(),
  recinto_id       uuid not null references public.recintos (id),
  numero           smallint not null check (numero > 0),
  sexo             char(1) not null check (sexo in ('F', 'M')),
  -- Electores de la junta: el distributivo solo los trae por recinto (puede ser null).
  numero_electores integer check (numero_electores > 0),
  unique (recinto_id, numero, sexo)
);

-- -----------------------------------------------------------------------------
-- 3. Candidaturas: una lista inscrita para una dignidad en su circunscripción.
--    Prefectura → provincia (con binomio). Alcaldía → cantón.
-- -----------------------------------------------------------------------------
create table public.candidaturas (
  id                    uuid primary key default gen_random_uuid(),
  dignidad              text not null check (dignidad in ('alcaldia', 'prefectura')),
  provincia_id          smallint not null references public.provincias (id),
  canton_id             integer references public.cantones (id),
  lista                 text not null check (lista ~ '^[0-9]+(-[0-9]+)*$'),
  organizacion_politica text not null check (btrim(organizacion_politica) <> ''),
  candidato             text not null check (btrim(candidato) <> ''),
  binomio               text check (binomio is null or btrim(binomio) <> ''),
  color                 text not null check (color ~ '^#[0-9A-F]{6}$'),
  constraint candidaturas_ambito_ck check (
    (dignidad = 'alcaldia'   and canton_id is not null and binomio is null) or
    (dignidad = 'prefectura' and canton_id is null     and binomio is not null)
  ),
  constraint candidaturas_lista_uk unique nulls not distinct (dignidad, provincia_id, canton_id, lista)
);
create index candidaturas_canton_id_idx on public.candidaturas (canton_id);

-- El cantón de una alcaldía debe pertenecer a la provincia indicada.
create function private.candidatura_ambito_coherente()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.canton_id is not null and not exists (
    select 1 from public.cantones c where c.id = new.canton_id and c.provincia_id = new.provincia_id
  ) then
    raise exception 'El cantón % no pertenece a la provincia %', new.canton_id, new.provincia_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger candidaturas_ambito_coherente
  before insert or update on public.candidaturas
  for each row execute function private.candidatura_ambito_coherente();

-- -----------------------------------------------------------------------------
-- 4. RLS activado desde el primer momento (sin políticas = nadie accede por la
--    API). Las políticas por rol y los GRANT llegan en la Fase 2.
-- -----------------------------------------------------------------------------
alter table public.provincias   enable row level security;
alter table public.cantones     enable row level security;
alter table public.parroquias   enable row level security;
alter table public.recintos     enable row level security;
alter table public.mesas        enable row level security;
alter table public.candidaturas enable row level security;

revoke all on public.provincias, public.cantones, public.parroquias, public.recintos,
  public.mesas, public.candidaturas from anon, authenticated;
