-- =============================================================================
-- Fase 4 · Funciones de gestión de cuentas para las Edge Functions.
-- F1 (crear-cuenta), F3 asistida (restablecer-clave), F4 (desactivar-cuenta).
-- Permisos: D-13 (alta), D-23 (personas visibles), D-28 (mismo modelo para F3/F4).
--
-- Se ejecutan SOLO con service_role (desde Edge Functions). Reciben el actor ya
-- autenticado por la función (claims del JWT verificados con getClaims).
-- =============================================================================

-- Rol del actor si puede operar (activo y sin clave temporal).
create function private.rol_operativo_de(p_actor uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.rol from public.perfiles p where p.id = p_actor and p.activo and not p.debe_cambiar_clave;
$$;

-- ¿El recinto está en la jurisdicción vigente del provincial?
create function private.recinto_en_jurisdiccion_de(p_actor uuid, p_recinto uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.recintos r
      join public.parroquias pa on pa.id = r.parroquia_id
      join public.cantones c on c.id = pa.canton_id
      join public.coordinaciones_provinciales cp on cp.provincia_id = c.provincia_id
     where r.id = p_recinto and cp.coordinador_id = p_actor and cp.hasta is null
  );
$$;

-- -----------------------------------------------------------------------------
-- F1: validación previa del alta. Devuelve null si se puede crear, o el motivo:
-- sin_permiso | recinto_no_valido | cedula_duplicada | correo_duplicado
-- -----------------------------------------------------------------------------
create function public.gestion_validar_alta(p_actor uuid, p_rol text, p_recinto uuid, p_cedula text, p_correo text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  rol_actor text := private.rol_operativo_de(p_actor);
begin
  if rol_actor is null or p_rol not in ('coordinador_recinto', 'veedor') then
    return 'sin_permiso';
  end if;

  if rol_actor = 'coordinador_provincial' then
    if p_rol = 'veedor' and (p_recinto is null or not private.recinto_en_jurisdiccion_de(p_actor, p_recinto)) then
      return 'recinto_no_valido';
    end if;
  elsif rol_actor = 'coordinador_recinto' then
    if p_rol <> 'veedor' then
      return 'sin_permiso';
    end if;
    if p_recinto is null or not exists (
      select 1 from public.coordinaciones_recinto cr
       where cr.coordinador_id = p_actor and cr.recinto_id = p_recinto and cr.hasta is null
    ) then
      return 'sin_permiso';
    end if;
  else
    return 'sin_permiso';
  end if;

  if exists (select 1 from public.perfiles where cedula = p_cedula) then
    return 'cedula_duplicada';
  end if;
  if exists (select 1 from public.perfiles where correo = lower(p_correo))
     or exists (select 1 from auth.users where lower(email) = lower(p_correo)) then
    return 'correo_duplicado';
  end if;
  return null;
end;
$$;

-- F1: perfil (+ recinto del veedor) en una sola transacción, tras auth.admin.createUser.
create function public.gestion_registrar_perfil(
  p_id uuid, p_actor uuid, p_cedula text, p_nombres text, p_apellidos text,
  p_telefono text, p_correo text, p_rol text, p_recinto uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  motivo text := public.gestion_validar_alta(p_actor, p_rol, p_recinto, p_cedula, p_correo);
begin
  -- Revalida dentro de la transacción (la Edge Function ya validó antes de crear el usuario).
  if motivo is not null and motivo <> 'correo_duplicado' then   -- el usuario de Auth ya existe
    raise exception 'Alta rechazada: %', motivo using errcode = 'check_violation', hint = motivo;
  end if;

  insert into public.perfiles (id, cedula, nombres, apellidos, telefono, correo, rol, creado_por)
  values (p_id, p_cedula, p_nombres, p_apellidos, p_telefono, lower(p_correo), p_rol, p_actor);

  if p_rol = 'veedor' then
    insert into public.veedores_recinto (veedor_id, recinto_id, registrado_por)
    values (p_id, p_recinto, p_actor);
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- F3 asistida / F4: ¿el actor puede administrar la cuenta del objetivo? (D-28)
-- -----------------------------------------------------------------------------
create function public.gestion_puede_administrar(p_actor uuid, p_objetivo uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with actor as (select private.rol_operativo_de(p_actor) as rol),
       objetivo as (select p.id, p.rol, p.creado_por from public.perfiles p where p.id = p_objetivo)
  select coalesce((
    select case
      when o.id = p_actor or o.rol = 'coordinador_provincial' then false
      when a.rol = 'coordinador_provincial' then
           o.creado_por = p_actor
        or exists (select 1 from public.veedores_recinto vr
                    where vr.veedor_id = o.id and vr.hasta is null
                      and private.recinto_en_jurisdiccion_de(p_actor, vr.recinto_id))
        or exists (select 1 from public.coordinaciones_recinto cr
                    where cr.coordinador_id = o.id and cr.hasta is null
                      and private.recinto_en_jurisdiccion_de(p_actor, cr.recinto_id))
      when a.rol = 'coordinador_recinto' then
           o.rol = 'veedor'
       and exists (select 1 from public.veedores_recinto vr
                    join public.coordinaciones_recinto cr on cr.recinto_id = vr.recinto_id
                   where vr.veedor_id = o.id and vr.hasta is null
                     and cr.coordinador_id = p_actor and cr.hasta is null)
      else false
    end
    from actor a, objetivo o
  ), false);
$$;

-- Solo service_role (Edge Functions). Nadie más, ni por la Data API.
revoke execute on function
  public.gestion_validar_alta(uuid, text, uuid, text, text),
  public.gestion_registrar_perfil(uuid, uuid, text, text, text, text, text, text, uuid),
  public.gestion_puede_administrar(uuid, uuid),
  private.rol_operativo_de(uuid),
  private.recinto_en_jurisdiccion_de(uuid, uuid)
  from public, anon, authenticated;
grant execute on function
  public.gestion_validar_alta(uuid, text, uuid, text, text),
  public.gestion_registrar_perfil(uuid, uuid, text, text, text, text, text, text, uuid),
  public.gestion_puede_administrar(uuid, uuid)
  to service_role;
grant usage on schema private to service_role;
grant execute on function private.rol_operativo_de(uuid), private.recinto_en_jurisdiccion_de(uuid, uuid) to service_role;
