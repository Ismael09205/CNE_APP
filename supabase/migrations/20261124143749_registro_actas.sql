-- =============================================================================
-- Fase 6 · Registro de actas sin conexión (F9, F10, ADR-14, ADR-15).
-- Decisiones: F6-5 (se acepta si la asignación estaba vigente en confirmada_en),
-- F6-6 (foto primero, luego RPC; foto huérfana reemplazable por el veedor vigente),
-- F6-7 (tolerancia de 5 minutos para el reloj del teléfono).
-- =============================================================================

-- 1. Un solo camino de alta: la RPC. Se quita el INSERT directo sobre las tablas.
drop policy "actas: alta por el veedor de la mesa" on public.actas;
drop policy "votos_acta: alta por el autor del acta" on public.votos_acta;
revoke insert on public.actas, public.votos_acta from authenticated;

-- 2. Fotos ---------------------------------------------------------------------

-- Mesa y dignidad de una ruta {mesa_id}/{dignidad}.jpg (null si la ruta no es válida).
create function private.ruta_foto_acta(p_name text)
returns table (mesa_id uuid, dignidad text)
language sql
immutable
set search_path = ''
as $$
  select (regexp_match(p_name, '^([0-9a-f-]{36})/(alcaldia|prefectura)\.jpg$'))[1]::uuid,
         (regexp_match(p_name, '^([0-9a-f-]{36})/(alcaldia|prefectura)\.jpg$'))[2]
   where p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(alcaldia|prefectura)\.jpg$';
$$;

-- Subida (INSERT): quien está o estuvo asignado a la mesa, mientras no exista el acta.
create function private.foto_acta_subible(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select private.rol_operativo() = 'veedor'
       and exists (select 1 from public.asignaciones_mesa am
                    where am.mesa_id = r.mesa_id and am.veedor_id = (select auth.uid()))
       and not exists (select 1 from public.actas a where a.mesa_id = r.mesa_id and a.dignidad = r.dignidad)
      from private.ruta_foto_acta(p_name) r
  ), false);
$$;

-- Reemplazo (UPDATE, upsert): solo el veedor vigente y mientras no exista el acta.
create function private.foto_acta_reemplazable(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select r.mesa_id = private.mesa_asignada()
       and not exists (select 1 from public.actas a where a.mesa_id = r.mesa_id and a.dignidad = r.dignidad)
      from private.ruta_foto_acta(p_name) r
  ), false);
$$;

-- Lectura de la propia foto aún sin acta (la necesita el upsert y el reintento).
create function private.foto_acta_propia(p_name text, p_owner text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_owner = (select auth.uid())::text and private.rol_operativo() = 'veedor'
     and exists (select 1 from private.ruta_foto_acta(p_name));
$$;

drop policy "actas fotos: subida por el veedor de la mesa" on storage.objects;
create policy "actas fotos: subida por el veedor de la mesa" on storage.objects
  for insert to authenticated with check (bucket_id = 'actas' and private.foto_acta_subible(name));
create policy "actas fotos: reemplazo de huerfana por el veedor vigente" on storage.objects
  for update to authenticated
  using (bucket_id = 'actas' and private.foto_acta_reemplazable(name))
  with check (bucket_id = 'actas' and private.foto_acta_reemplazable(name));
create policy "actas fotos: la propia" on storage.objects
  for select to authenticated using (bucket_id = 'actas' and private.foto_acta_propia(name, owner_id));

-- 3. RPC ----------------------------------------------------------------------
-- Devuelve 'guardada' | 'ya_guardada' (mismo UUID, reintento) | 'conflicto'
-- (otra acta para la misma mesa y dignidad). Los rechazos definitivos se lanzan
-- con errcode check_violation y un hint estable.
create function private.registrar_acta_impl(p_acta jsonb)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := (select auth.uid());
  v_id         uuid;
  v_mesa       uuid;
  v_dignidad   text;
  v_confirmada timestamptz;
  v_capturada  timestamptz;
  v_foto       text;
  v_existente  uuid;
begin
  if private.rol_operativo() is distinct from 'veedor' then
    raise exception 'Solo un veedor habilitado registra actas' using errcode = 'check_violation', hint = 'no_autorizado';
  end if;

  begin
    v_id         := (p_acta ->> 'id')::uuid;
    v_mesa       := (p_acta ->> 'mesa_id')::uuid;
    v_dignidad   := p_acta ->> 'dignidad';
    v_confirmada := (p_acta ->> 'confirmada_en')::timestamptz;
    v_capturada  := (p_acta ->> 'capturada_en')::timestamptz;
  exception when others then
    raise exception 'Datos del acta no válidos' using errcode = 'check_violation', hint = 'datos_invalidos';
  end;
  if v_id is null or v_mesa is null or v_confirmada is null or v_capturada is null
     or v_dignidad is null or v_dignidad not in ('alcaldia', 'prefectura')
     or jsonb_typeof(p_acta -> 'votos') is distinct from 'array' then
    raise exception 'Datos del acta no válidos' using errcode = 'check_violation', hint = 'datos_invalidos';
  end if;

  -- Idempotencia y unicidad por (mesa, dignidad). Se bloquea la pareja para evitar carreras.
  perform pg_advisory_xact_lock(hashtextextended(v_mesa::text || '/' || v_dignidad, 0));
  select a.id into v_existente from public.actas a where a.id = v_id;
  if found then
    return case when exists (select 1 from public.actas a where a.id = v_id and a.mesa_id = v_mesa
                              and a.dignidad = v_dignidad and a.veedor_id = v_uid)
                then 'ya_guardada' else 'conflicto' end;
  end if;
  if exists (select 1 from public.actas a where a.mesa_id = v_mesa and a.dignidad = v_dignidad) then
    return 'conflicto';
  end if;

  -- Hora del teléfono: no puede adelantarse más de 5 minutos (F6-7).
  if v_confirmada > now() + interval '5 minutes' or v_capturada > now() + interval '5 minutes'
     or v_capturada > v_confirmada then
    raise exception 'La hora del teléfono no es correcta' using errcode = 'check_violation', hint = 'hora_invalida';
  end if;

  -- Vigencia de la asignación en el momento de confirmar (F6-5).
  if not exists (
    select 1 from public.asignaciones_mesa am
     where am.mesa_id = v_mesa and am.veedor_id = v_uid
       and am.desde <= v_confirmada and (am.hasta is null or am.hasta > v_confirmada)
  ) then
    raise exception 'La mesa no estaba asignada a este veedor al confirmar el acta'
      using errcode = 'check_violation', hint = 'fuera_de_vigencia';
  end if;

  -- La foto ya debe estar subida, y por esta persona (F6-6).
  v_foto := v_mesa::text || '/' || v_dignidad || '.jpg';
  if not exists (select 1 from storage.objects o
                  where o.bucket_id = 'actas' and o.name = v_foto and o.owner_id = v_uid::text) then
    raise exception 'Falta la foto del acta' using errcode = 'check_violation', hint = 'foto_faltante';
  end if;

  begin
    insert into public.actas (id, mesa_id, dignidad, veedor_id, votos_nulos, votos_blancos, total_sufragantes,
                              estado, confirmada_en, foto_path, lat, lng, precision_m, ubicacion_simulada, capturada_en)
    values (v_id, v_mesa, v_dignidad, v_uid,
            (p_acta ->> 'votos_nulos')::integer, (p_acta ->> 'votos_blancos')::integer,
            (p_acta ->> 'total_sufragantes')::integer, 'enviada', v_confirmada, v_foto,
            (p_acta ->> 'lat')::double precision, (p_acta ->> 'lng')::double precision,
            (p_acta ->> 'precision_m')::real, (p_acta ->> 'ubicacion_simulada')::boolean, v_capturada);

    insert into public.votos_acta (acta_id, candidatura_id, votos)
    select v_id, (v ->> 'candidatura_id')::uuid, (v ->> 'votos')::integer
      from jsonb_array_elements(p_acta -> 'votos') v;
  exception
    when unique_violation then return 'conflicto';
    when invalid_text_representation or numeric_value_out_of_range or not_null_violation
         or foreign_key_violation then
      raise exception 'Datos del acta no válidos' using errcode = 'check_violation', hint = 'datos_invalidos';
  end;

  -- Reglas del acta (trigger diferido) aquí mismo, para devolver el motivo a la app.
  set constraints all immediate;
  return 'guardada';
end;
$$;

create function public.registrar_acta(p_acta jsonb)
returns text language sql security invoker set search_path = ''
as $$ select private.registrar_acta_impl(p_acta); $$;

revoke execute on function
  public.registrar_acta(jsonb), private.registrar_acta_impl(jsonb),
  private.ruta_foto_acta(text), private.foto_acta_subible(text),
  private.foto_acta_reemplazable(text), private.foto_acta_propia(text, text)
  from public, anon;
grant execute on function
  public.registrar_acta(jsonb), private.registrar_acta_impl(jsonb),
  private.ruta_foto_acta(text), private.foto_acta_subible(text),
  private.foto_acta_reemplazable(text), private.foto_acta_propia(text, text)
  to authenticated;
