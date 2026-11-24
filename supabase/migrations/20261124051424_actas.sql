-- =============================================================================
-- Fase 1 · Migración 3: actas, votos, reglas del acta, inmutabilidad y Storage.
-- RF-11..RF-15, S-07, S-08, ADR-11, ADR-12, ADR-13, ADR-14, ADR-15.
-- Las reglas cruzadas DEBEN coincidir con src/domain/rules/acta.rules.ts
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Actas: 2 por mesa (UNIQUE mesa + dignidad). El UUID lo genera el cliente.
-- -----------------------------------------------------------------------------
create table public.actas (
  id                 uuid primary key,
  mesa_id            uuid not null references public.mesas (id),
  dignidad           text not null check (dignidad in ('alcaldia', 'prefectura')),
  veedor_id          uuid not null references public.perfiles (id),
  votos_nulos        integer not null check (votos_nulos >= 0),
  votos_blancos      integer not null check (votos_blancos >= 0),
  total_sufragantes  integer not null check (total_sufragantes >= 0),
  estado             text not null default 'enviada' check (estado in ('borrador', 'enviada')),
  confirmada_en      timestamptz,
  -- Evidencia (RF-13). Ruta fija en el bucket para que los reintentos no dupliquen.
  foto_path          text,
  lat                double precision check (lat between -90 and 90),
  lng                double precision check (lng between -180 and 180),
  precision_m        real check (precision_m >= 0),
  ubicacion_simulada boolean,
  capturada_en       timestamptz,
  recibida_en        timestamptz not null default now(),
  constraint actas_mesa_dignidad_uk unique (mesa_id, dignidad),
  constraint actas_foto_path_ck check (foto_path is null or foto_path = mesa_id::text || '/' || dignidad || '.jpg'),
  constraint actas_enviada_completa_ck check (
    estado = 'borrador' or (
      confirmada_en is not null and foto_path is not null and lat is not null and lng is not null
      and precision_m is not null and ubicacion_simulada is not null and capturada_en is not null
    )
  )
);
create index actas_veedor_id_idx on public.actas (veedor_id);

create table public.votos_acta (
  acta_id        uuid not null references public.actas (id),
  candidatura_id uuid not null references public.candidaturas (id),
  votos          integer not null check (votos >= 0),
  primary key (acta_id, candidatura_id)
);
create index votos_acta_candidatura_id_idx on public.votos_acta (candidatura_id);

-- -----------------------------------------------------------------------------
-- 2. Reglas del acta (se evalúan al final de la transacción: acta + votos juntos).
--    Códigos en HINT = códigos de violación del dominio.
-- -----------------------------------------------------------------------------
create function private.validar_acta(p_acta_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  a           public.actas;
  m_electores integer;
  m_canton    integer;
  m_provincia smallint;
  suma        bigint;
begin
  select * into a from public.actas where id = p_acta_id;
  if not found then
    return; -- borrada en la misma transacción (solo posible en borrador)
  end if;

  perform private.exigir_rol(a.veedor_id, 'veedor');

  select m.numero_electores, p.canton_id, c.provincia_id
    into m_electores, m_canton, m_provincia
    from public.mesas m
    join public.recintos r   on r.id = m.recinto_id
    join public.parroquias p on p.id = r.parroquia_id
    join public.cantones c   on c.id = p.canton_id
   where m.id = a.mesa_id;

  -- Todas las candidaturas de la dignidad en la circunscripción de la mesa, sin extras.
  if exists (
    select 1 from public.votos_acta v
      join public.candidaturas k on k.id = v.candidatura_id
     where v.acta_id = a.id
       and not (k.dignidad = a.dignidad and k.provincia_id = m_provincia
                and (k.canton_id is null or k.canton_id = m_canton))
  ) then
    raise exception 'Hay votos de una lista que no participa en esta dignidad'
      using errcode = 'check_violation', hint = 'candidatura_desconocida';
  end if;

  if exists (
    select 1 from public.candidaturas k
     where k.dignidad = a.dignidad and k.provincia_id = m_provincia
       and (k.dignidad = 'prefectura' or k.canton_id = m_canton)
       and not exists (select 1 from public.votos_acta v where v.acta_id = a.id and v.candidatura_id = k.id)
  ) then
    raise exception 'Faltan los votos de una o más listas'
      using errcode = 'check_violation', hint = 'candidatura_faltante';
  end if;

  if m_electores is not null and a.total_sufragantes > m_electores then
    raise exception 'El total de sufragantes (%) pasa de los electores de la mesa (%)', a.total_sufragantes, m_electores
      using errcode = 'check_violation', hint = 'total_mayor_que_maximo';
  end if;

  if exists (select 1 from public.votos_acta v where v.acta_id = a.id and v.votos > a.total_sufragantes) then
    raise exception 'Los votos de una lista no pueden ser más que el total de sufragantes'
      using errcode = 'check_violation', hint = 'votos_mayor_que_total';
  end if;

  select coalesce(sum(v.votos), 0) + a.votos_nulos + a.votos_blancos into suma
    from public.votos_acta v where v.acta_id = a.id;
  if suma <> a.total_sufragantes then
    raise exception 'La suma de votos, nulos y blancos (%) no coincide con el total de sufragantes (%)', suma, a.total_sufragantes
      using errcode = 'check_violation', hint = 'suma_no_cuadra';
  end if;
end;
$$;

create function private.validar_acta_trigger()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform private.validar_acta(case when tg_table_name = 'actas' then new.id else new.acta_id end);
  return null;
end;
$$;

-- DEFERRABLE INITIALLY DEFERRED: se valida al COMMIT, cuando ya están acta y votos.
create constraint trigger actas_reglas
  after insert or update on public.actas
  deferrable initially deferred
  for each row execute function private.validar_acta_trigger();

create constraint trigger votos_acta_reglas
  after insert or update on public.votos_acta
  deferrable initially deferred
  for each row execute function private.validar_acta_trigger();

-- -----------------------------------------------------------------------------
-- 3. Inmutabilidad (ADR-14): un acta enviada y sus votos no cambian nunca,
--    ni siquiera con service_role.
-- -----------------------------------------------------------------------------
create function private.acta_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  estado_acta text;
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'Las actas no se pueden borrar' using errcode = 'insufficient_privilege', hint = 'acta_inmutable';
  end if;

  if tg_table_name = 'actas' then
    if old.estado = 'enviada' then
      raise exception 'El acta % ya fue enviada y no se puede modificar', old.id
        using errcode = 'insufficient_privilege', hint = 'acta_inmutable';
    end if;
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  -- votos_acta (UPDATE / DELETE). Un INSERT posterior sobre un acta ya guardada lo
  -- rechazan la PK (lista repetida) o validar_acta al COMMIT (lista extra o suma).
  select a.estado into estado_acta from public.actas a where a.id = old.acta_id;
  if estado_acta = 'enviada' then
    raise exception 'Los votos del acta % ya fueron enviados y no se pueden modificar', old.acta_id
      using errcode = 'insufficient_privilege', hint = 'acta_inmutable';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger actas_inmutable before update or delete on public.actas
  for each row execute function private.acta_inmutable();
create trigger actas_inmutable_truncate before truncate on public.actas
  for each statement execute function private.acta_inmutable();
create trigger votos_acta_inmutable before update or delete on public.votos_acta
  for each row execute function private.acta_inmutable();
create trigger votos_acta_inmutable_truncate before truncate on public.votos_acta
  for each statement execute function private.acta_inmutable();

-- -----------------------------------------------------------------------------
-- 4. RLS activado (políticas y GRANT en la Fase 2; sin UPDATE ni DELETE nunca).
-- -----------------------------------------------------------------------------
alter table public.actas      enable row level security;
alter table public.votos_acta enable row level security;
revoke all on public.actas, public.votos_acta from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. Bucket privado de fotos de actas: {mesa_id}/{dignidad}.jpg (ADR-13, ADR-15).
--    Políticas de storage.objects en la Fase 2 (sin políticas = sin acceso).
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, allowed_mime_types)
values ('actas', 'actas', false, array['image/jpeg'])
on conflict (id) do nothing;
