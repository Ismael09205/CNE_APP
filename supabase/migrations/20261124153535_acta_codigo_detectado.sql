-- F6-8: ¿se leyó el código de barras/QR del acta al tomar la foto? Solo sí/no (no se guarda
-- el valor). false = el acta queda marcada para revisión, igual que una ubicación imprecisa (F6-4).
alter table public.actas add column codigo_detectado boolean;
alter table public.actas add constraint actas_codigo_detectado_ck
  check (estado = 'borrador' or codigo_detectado is not null);
comment on column public.actas.codigo_detectado is
  'F6-8: true si la app leyó el código de barras/QR del acta al fotografiarla. false = revisar.';

-- F6-8 (B): cada casilla del acta tiene centena, decena y unidad → máximo 999.
alter table public.actas add constraint actas_max_tres_digitos_ck
  check (votos_nulos <= 999 and votos_blancos <= 999 and total_sufragantes <= 999);
alter table public.votos_acta add constraint votos_acta_max_tres_digitos_ck check (votos <= 999);

create or replace function private.registrar_acta_impl(p_acta jsonb)
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
  -- Las reglas del acta (trigger diferido) deben correr después de insertar los votos,
  -- aunque la transacción que llama ya tenga las restricciones en modo inmediato.
  set constraints all deferred;

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
     or jsonb_typeof(p_acta -> 'votos') is distinct from 'array'
     or jsonb_typeof(p_acta -> 'codigo_detectado') is distinct from 'boolean' then
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
                              estado, confirmada_en, foto_path, lat, lng, precision_m, ubicacion_simulada, capturada_en,
                              codigo_detectado)
    values (v_id, v_mesa, v_dignidad, v_uid,
            (p_acta ->> 'votos_nulos')::integer, (p_acta ->> 'votos_blancos')::integer,
            (p_acta ->> 'total_sufragantes')::integer, 'enviada', v_confirmada, v_foto,
            (p_acta ->> 'lat')::double precision, (p_acta ->> 'lng')::double precision,
            (p_acta ->> 'precision_m')::real, (p_acta ->> 'ubicacion_simulada')::boolean, v_capturada,
            (p_acta ->> 'codigo_detectado')::boolean);

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
