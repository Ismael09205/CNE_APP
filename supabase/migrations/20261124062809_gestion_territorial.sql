-- =============================================================================
-- Fase 5 · Gestión territorial: alta de recintos y mesas (F5), coordinación de
-- recinto (F6), asignación (F7) y reemplazo de veedores (F8).
-- ADR-07..ADR-10, S-04..S-06, D-06, D-30..D-34.
--
-- Las RPC de vigencias son SECURITY DEFINER porque cierran y abren vigencias que
-- el cliente no puede modificar directamente; por eso cada una verifica primero
-- quién llama (auth.uid(), rol, cuenta habilitada y alcance). Errores con HINT =
-- código para la app.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Precisión del GPS del recinto (D-30, D-31). Los del distributivo quedan null.
-- -----------------------------------------------------------------------------
alter table public.recintos
  add column precision_m real constraint recintos_precision_ck check (precision_m is null or (precision_m >= 0 and precision_m <= 50));

grant insert (precision_m) on public.recintos to authenticated;

-- Los recintos creados desde la app deben traer la precisión del GPS.
drop policy "recintos: alta por el provincial en su jurisdiccion" on public.recintos;
create policy "recintos: alta por el provincial en su jurisdiccion" on public.recintos
  for insert to authenticated with check (
    (select private.rol_operativo()) = 'coordinador_provincial'
    and creado_por = (select auth.uid())
    and precision_m is not null
    and private.parroquia_en_jurisdiccion(parroquia_id)
  );

-- -----------------------------------------------------------------------------
-- 2. F5: mesas por rango (D-32). SECURITY INVOKER: aplica la RLS de `mesas`.
-- -----------------------------------------------------------------------------
create function public.agregar_mesas(p_recinto uuid, p_sexo text, p_desde integer, p_hasta integer)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existentes text;
  creadas integer;
begin
  if p_sexo not in ('F', 'M') or p_desde is null or p_hasta is null or p_desde < 1 or p_hasta < p_desde or p_hasta - p_desde >= 60 then
    raise exception 'Rango de mesas no válido' using errcode = 'check_violation', hint = 'rango_invalido';
  end if;

  select string_agg(m.numero::text, ', ' order by m.numero) into existentes
    from public.mesas m
   where m.recinto_id = p_recinto and m.sexo = p_sexo and m.numero between p_desde and p_hasta;
  if existentes is not null then
    raise exception 'Ya existen las juntas % (%)', existentes, p_sexo using errcode = 'unique_violation', hint = 'mesas_existentes', detail = existentes;
  end if;

  insert into public.mesas (recinto_id, numero, sexo)
  select p_recinto, n, p_sexo from generate_series(p_desde, p_hasta) as n;
  get diagnostics creadas = row_count;
  return creadas;
exception
  when insufficient_privilege then
    raise exception 'Sin permiso para agregar mesas a este recinto' using errcode = 'insufficient_privilege', hint = 'sin_permiso';
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. F6: asignar coordinador de recinto (ADR-08, D-06, D-34).
-- -----------------------------------------------------------------------------
create function public.asignar_coordinador(p_recinto uuid, p_coordinador uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  nueva uuid;
begin
  if private.rol_operativo_de(actor) is distinct from 'coordinador_provincial'
     or not private.recinto_en_jurisdiccion_de(actor, p_recinto) then
    raise exception 'Sin permiso' using errcode = 'insufficient_privilege', hint = 'sin_permiso';
  end if;

  -- Serializa cambios concurrentes sobre el mismo recinto.
  perform 1 from public.recintos where id = p_recinto for update;

  if not exists (select 1 from public.perfiles p
                  where p.id = p_coordinador and p.rol = 'coordinador_recinto' and p.activo) then
    raise exception 'Persona no válida' using errcode = 'check_violation', hint = 'coordinador_no_valido';
  end if;
  if exists (select 1 from public.coordinaciones_recinto
              where coordinador_id = p_coordinador and recinto_id = p_recinto and hasta is null) then
    raise exception 'Ya coordina este recinto' using errcode = 'check_violation', hint = 'ya_asignado';
  end if;
  -- D-06 + D-34: no se "mueve" a un coordinador dejando otro recinto vacío.
  if exists (select 1 from public.coordinaciones_recinto where coordinador_id = p_coordinador and hasta is null) then
    raise exception 'Ya coordina otro recinto' using errcode = 'check_violation', hint = 'coordinador_con_recinto';
  end if;

  update public.coordinaciones_recinto set hasta = now() where recinto_id = p_recinto and hasta is null;
  insert into public.coordinaciones_recinto (recinto_id, coordinador_id, asignado_por)
  values (p_recinto, p_coordinador, actor)
  returning id into nueva;
  return nueva;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Validaciones comunes de F7/F8 (dentro de la transacción y con la mesa bloqueada).
-- -----------------------------------------------------------------------------
create function private.validar_gestion_mesa(p_actor uuid, p_mesa uuid, p_veedor uuid)
returns uuid  -- recinto de la mesa
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recinto uuid;
begin
  select m.recinto_id into v_recinto from public.mesas m where m.id = p_mesa for update;
  if v_recinto is null then
    raise exception 'Mesa no encontrada' using errcode = 'no_data_found', hint = 'mesa_no_encontrada';
  end if;
  if private.rol_operativo_de(p_actor) is distinct from 'coordinador_recinto' or not exists (
       select 1 from public.coordinaciones_recinto
        where coordinador_id = p_actor and recinto_id = v_recinto and hasta is null) then
    raise exception 'No es el coordinador vigente' using errcode = 'insufficient_privilege', hint = 'no_es_coordinador_vigente';
  end if;
  if not exists (select 1 from public.perfiles p where p.id = p_veedor and p.rol = 'veedor' and p.activo) then
    raise exception 'Veedor no válido' using errcode = 'check_violation', hint = 'veedor_no_valido';
  end if;
  -- S-06 y D-33: solo veedores registrados en este recinto.
  if not exists (select 1 from public.veedores_recinto
                  where veedor_id = p_veedor and recinto_id = v_recinto and hasta is null) then
    raise exception 'Veedor de otro recinto' using errcode = 'check_violation', hint = 'veedor_de_otro_recinto';
  end if;
  -- S-04: una mesa vigente por veedor.
  if exists (select 1 from public.asignaciones_mesa where veedor_id = p_veedor and hasta is null) then
    raise exception 'Veedor con otra mesa' using errcode = 'check_violation', hint = 'veedor_con_otra_mesa';
  end if;
  return v_recinto;
end;
$$;

-- F7: primera asignación de una mesa sin veedor (ADR-09, D-33).
create function public.asignar_veedor(p_mesa uuid, p_veedor uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  nueva uuid;
begin
  perform private.validar_gestion_mesa(actor, p_mesa, p_veedor);
  if exists (select 1 from public.asignaciones_mesa where mesa_id = p_mesa and hasta is null) then
    raise exception 'La mesa ya tiene veedor' using errcode = 'check_violation', hint = 'mesa_con_veedor';
  end if;
  insert into public.asignaciones_mesa (mesa_id, veedor_id, asignado_por)
  values (p_mesa, p_veedor, actor)
  returning id into nueva;
  return nueva;
exception
  when unique_violation then
    raise exception 'Cambio simultáneo' using errcode = 'serialization_failure', hint = 'reemplazo_concurrente';
end;
$$;

-- F8: reemplazo inmediato del veedor ausente (ADR-10, S-04, S-06).
-- p_veedor_actual = el veedor que la app mostraba; si cambió en el medio, se
-- rechaza como reemplazo concurrente en lugar de reemplazar a otra persona.
create function public.reemplazar_veedor(p_mesa uuid, p_veedor_actual uuid, p_nuevo_veedor uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  vigente uuid;
  nueva uuid;
begin
  perform private.validar_gestion_mesa(actor, p_mesa, p_nuevo_veedor);

  select veedor_id into vigente from public.asignaciones_mesa where mesa_id = p_mesa and hasta is null;
  if vigente is null then
    raise exception 'La mesa no tiene veedor' using errcode = 'check_violation', hint = 'mesa_sin_veedor';
  end if;
  if vigente is distinct from p_veedor_actual then
    raise exception 'Otra persona cambió la mesa' using errcode = 'serialization_failure', hint = 'reemplazo_concurrente';
  end if;

  update public.asignaciones_mesa set hasta = now() where mesa_id = p_mesa and hasta is null;
  insert into public.asignaciones_mesa (mesa_id, veedor_id, asignado_por)
  values (p_mesa, p_nuevo_veedor, actor)
  returning id into nueva;
  return nueva;
exception
  when unique_violation then
    raise exception 'Cambio simultáneo' using errcode = 'serialization_failure', hint = 'reemplazo_concurrente';
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Permisos: las RPC son la única vía para estas operaciones.
-- -----------------------------------------------------------------------------
revoke execute on function
  public.agregar_mesas(uuid, text, integer, integer),
  public.asignar_coordinador(uuid, uuid),
  public.asignar_veedor(uuid, uuid),
  public.reemplazar_veedor(uuid, uuid, uuid),
  private.validar_gestion_mesa(uuid, uuid, uuid)
  from public, anon;
grant execute on function
  public.agregar_mesas(uuid, text, integer, integer),
  public.asignar_coordinador(uuid, uuid),
  public.asignar_veedor(uuid, uuid),
  public.reemplazar_veedor(uuid, uuid, uuid)
  to authenticated;
revoke execute on function private.validar_gestion_mesa(uuid, uuid, uuid) from authenticated;
-- Las funciones definer llaman a estos helpers como su dueño (postgres); no hace falta exponerlos.
