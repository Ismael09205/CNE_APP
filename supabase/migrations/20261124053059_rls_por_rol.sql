-- =============================================================================
-- Fase 2 · RLS por rol, GRANT mínimos y políticas de Storage.
-- PROJECT_SPEC §3.2, RF-02, RF-03, RF-16, RNF-04, ADR-02, ADR-03, ADR-14, ADR-16.
-- Decisiones: D-21 (GRANT explícitos), D-22 (perfil propio siempre legible),
-- D-23 (personas visibles para el provincial), D-24 (alcance del catálogo).
--
-- Regla base: todo dato electoral exige perfil activo y clave ya cambiada.
-- Las asignaciones y coordinaciones solo cambian por RPC (Fase 5); las cuentas,
-- por Edge Functions con service_role (Fase 4). No hay UPDATE ni DELETE desde el
-- cliente en ninguna tabla.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Funciones auxiliares (SECURITY DEFINER en `private`: no están en la API,
--    solo responden sobre auth.uid() y evitan recursión entre políticas).
-- -----------------------------------------------------------------------------

-- Rol de quien llama si puede operar (activo y sin clave temporal); si no, null.
create function private.rol_operativo()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.rol from public.perfiles p
   where p.id = (select auth.uid()) and p.activo and not p.debe_cambiar_clave;
$$;

-- Provincias de la jurisdicción vigente del coordinador provincial.
create function private.provincias_jurisdiccion()
returns smallint[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(cp.provincia_id), '{}')
    from public.coordinaciones_provinciales cp
   where cp.coordinador_id = (select auth.uid()) and cp.hasta is null
     and private.rol_operativo() = 'coordinador_provincial';
$$;

-- Recinto vigente del coordinador de recinto (D-06: uno solo).
create function private.recinto_coordinado()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select cr.recinto_id from public.coordinaciones_recinto cr
   where cr.coordinador_id = (select auth.uid()) and cr.hasta is null
     and private.rol_operativo() = 'coordinador_recinto';
$$;

-- Mesa vigente del veedor (S-04: una sola).
create function private.mesa_asignada()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select am.mesa_id from public.asignaciones_mesa am
   where am.veedor_id = (select auth.uid()) and am.hasta is null
     and private.rol_operativo() = 'veedor';
$$;

-- Recintos que puede ver quien llama (D-24).
create function private.recintos_visibles()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(r.id), '{}')
    from public.recintos r
    join public.parroquias pa on pa.id = r.parroquia_id
    join public.cantones c on c.id = pa.canton_id
   where c.provincia_id = any (private.provincias_jurisdiccion())
      or r.id = private.recinto_coordinado()
      or r.id = (select m.recinto_id from public.mesas m where m.id = private.mesa_asignada());
$$;

-- Mesas que puede ver quien llama: provincial y coordinador por recinto; veedor solo la suya.
create function private.mesas_visibles()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.rol_operativo() = 'veedor' then
      coalesce(array_remove(array[private.mesa_asignada()], null), '{}')
    else
      coalesce((select array_agg(m.id) from public.mesas m where m.recinto_id = any (private.recintos_visibles())), '{}')
  end;
$$;

-- Personas (perfiles) que puede ver quien llama, además de sí mismo (D-23).
create function private.personas_visibles()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  with rol as (select private.rol_operativo() as r),
       recintos as (select unnest(private.recintos_visibles()) as id)
  select coalesce(array_agg(distinct x.id), '{}') from (
    -- Provincial: las personas que creó.
    select p.id from public.perfiles p, rol
     where rol.r = 'coordinador_provincial' and p.creado_por = (select auth.uid())
    union all
    -- Provincial y coordinador: veedores registrados en sus recintos.
    select vr.veedor_id from public.veedores_recinto vr, rol
     where rol.r in ('coordinador_provincial', 'coordinador_recinto')
       and vr.hasta is null and vr.recinto_id in (select id from recintos)
    union all
    -- Provincial: coordinadores vigentes de sus recintos.
    select cr.coordinador_id from public.coordinaciones_recinto cr, rol
     where rol.r = 'coordinador_provincial' and cr.hasta is null and cr.recinto_id in (select id from recintos)
    union all
    -- Provincial y coordinador: autores de actas de sus recintos (revisión del acta).
    select a.veedor_id from public.actas a join public.mesas m on m.id = a.mesa_id, rol
     where rol.r in ('coordinador_provincial', 'coordinador_recinto') and m.recinto_id in (select id from recintos)
  ) x;
$$;

-- ¿La parroquia está en la jurisdicción del provincial? (alta de recintos)
create function private.parroquia_en_jurisdiccion(p_parroquia_id integer)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.parroquias pa join public.cantones c on c.id = pa.canton_id
     where pa.id = p_parroquia_id and c.provincia_id = any (private.provincias_jurisdiccion())
  );
$$;

grant usage on schema private to authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.rol_operativo(), private.provincias_jurisdiccion(), private.recinto_coordinado(),
  private.mesa_asignada(), private.recintos_visibles(), private.mesas_visibles(),
  private.personas_visibles(), private.parroquia_en_jurisdiccion(integer)
  to authenticated;

-- -----------------------------------------------------------------------------
-- 2. GRANT mínimos (D-21). anon no recibe nada.
-- -----------------------------------------------------------------------------
grant select on public.provincias, public.cantones, public.parroquias, public.candidaturas,
  public.recintos, public.mesas, public.perfiles, public.coordinaciones_provinciales,
  public.coordinaciones_recinto, public.veedores_recinto, public.asignaciones_mesa,
  public.actas, public.votos_acta
  to authenticated;

-- Alta de recintos y mesas por el provincial (RF-07). Sin id ni fechas del servidor.
grant insert (parroquia_id, codigo, nombre, codigo_zona, nombre_zona, direccion, lat, lng,
              dificil_acceso, sin_conectividad, creado_por)
  on public.recintos to authenticated;
grant insert (recinto_id, numero, sexo, numero_electores) on public.mesas to authenticated;

-- Registro de actas por el veedor. Sin `estado` (siempre 'enviada') ni `recibida_en`.
grant insert (id, mesa_id, dignidad, veedor_id, votos_nulos, votos_blancos, total_sufragantes,
              confirmada_en, foto_path, lat, lng, precision_m, ubicacion_simulada, capturada_en)
  on public.actas to authenticated;
grant insert (acta_id, candidatura_id, votos) on public.votos_acta to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Políticas
-- -----------------------------------------------------------------------------

-- Catálogo público (D-24): cualquier usuario habilitado.
create policy "catalogo: usuarios habilitados" on public.provincias
  for select to authenticated using ((select private.rol_operativo()) is not null);
create policy "catalogo: usuarios habilitados" on public.cantones
  for select to authenticated using ((select private.rol_operativo()) is not null);
create policy "catalogo: usuarios habilitados" on public.parroquias
  for select to authenticated using ((select private.rol_operativo()) is not null);
create policy "catalogo: usuarios habilitados" on public.candidaturas
  for select to authenticated using ((select private.rol_operativo()) is not null);

-- Recintos y mesas por alcance.
create policy "recintos: segun alcance" on public.recintos
  for select to authenticated using (id = any ((select private.recintos_visibles())::uuid[]));
create policy "recintos: alta por el provincial en su jurisdiccion" on public.recintos
  for insert to authenticated with check (
    (select private.rol_operativo()) = 'coordinador_provincial'
    and creado_por = (select auth.uid())
    and private.parroquia_en_jurisdiccion(parroquia_id)
  );

create policy "mesas: segun alcance" on public.mesas
  for select to authenticated using (id = any ((select private.mesas_visibles())::uuid[]));
create policy "mesas: alta por el provincial en su jurisdiccion" on public.mesas
  for insert to authenticated with check (
    (select private.rol_operativo()) = 'coordinador_provincial'
    and recinto_id = any ((select private.recintos_visibles())::uuid[])
  );

-- Perfiles: el propio siempre (D-22); otros, según alcance (D-23).
create policy "perfiles: el propio" on public.perfiles
  for select to authenticated using (id = (select auth.uid()));
create policy "perfiles: segun alcance" on public.perfiles
  for select to authenticated using (id = any ((select private.personas_visibles())::uuid[]));

-- Vigencias.
create policy "coordinaciones_provinciales: la propia" on public.coordinaciones_provinciales
  for select to authenticated using (
    coordinador_id = (select auth.uid()) and (select private.rol_operativo()) = 'coordinador_provincial'
  );
create policy "coordinaciones_recinto: provincial y coordinador" on public.coordinaciones_recinto
  for select to authenticated using (
    (select private.rol_operativo()) in ('coordinador_provincial', 'coordinador_recinto')
    and recinto_id = any ((select private.recintos_visibles())::uuid[])
  );
create policy "veedores_recinto: provincial y coordinador" on public.veedores_recinto
  for select to authenticated using (
    (select private.rol_operativo()) in ('coordinador_provincial', 'coordinador_recinto')
    and recinto_id = any ((select private.recintos_visibles())::uuid[])
  );
create policy "veedores_recinto: el propio vigente" on public.veedores_recinto
  for select to authenticated using (
    veedor_id = (select auth.uid()) and hasta is null and (select private.rol_operativo()) = 'veedor'
  );
create policy "asignaciones_mesa: provincial y coordinador" on public.asignaciones_mesa
  for select to authenticated using (
    (select private.rol_operativo()) in ('coordinador_provincial', 'coordinador_recinto')
    and mesa_id = any ((select private.mesas_visibles())::uuid[])
  );
create policy "asignaciones_mesa: la propia vigente" on public.asignaciones_mesa
  for select to authenticated using (
    veedor_id = (select auth.uid()) and hasta is null and (select private.rol_operativo()) = 'veedor'
  );

-- Actas: lectura por alcance; alta solo del veedor en su mesa vigente.
-- Sin políticas UPDATE ni DELETE (ADR-14).
create policy "actas: segun alcance" on public.actas
  for select to authenticated using (mesa_id = any ((select private.mesas_visibles())::uuid[]));
create policy "actas: alta por el veedor de la mesa" on public.actas
  for insert to authenticated with check (
    (select private.rol_operativo()) = 'veedor'
    and veedor_id = (select auth.uid())
    and mesa_id = (select private.mesa_asignada())
    and estado = 'enviada'
  );

create policy "votos_acta: segun alcance del acta" on public.votos_acta
  for select to authenticated using (
    exists (select 1 from public.actas a where a.id = acta_id)   -- aplica la RLS de actas
  );
create policy "votos_acta: alta por el autor del acta" on public.votos_acta
  for insert to authenticated with check (
    exists (
      select 1 from public.actas a
       where a.id = acta_id and a.veedor_id = (select auth.uid())
         and a.mesa_id = (select private.mesa_asignada())
    )
  );

-- -----------------------------------------------------------------------------
-- 4. Storage: bucket `actas`, ruta {mesa_id}/{dignidad}.jpg (ADR-13, ADR-15).
--    Subida: solo el veedor de la mesa, sin sobrescribir (no hay UPDATE ni DELETE).
--    Lectura (URL firmada): mismo alcance que las actas.
-- -----------------------------------------------------------------------------
create policy "actas fotos: subida por el veedor de la mesa" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'actas'
    and (storage.foldername(name))[1] = (select private.mesa_asignada())::text
    and storage.filename(name) in ('alcaldia.jpg', 'prefectura.jpg')
    and array_length(storage.foldername(name), 1) = 1
  );
create policy "actas fotos: lectura segun alcance" on storage.objects
  for select to authenticated using (
    bucket_id = 'actas'
    and (storage.foldername(name))[1] = any ((select private.mesas_visibles())::text[])
  );

-- -----------------------------------------------------------------------------
-- 5. Índice pendiente del advisor (FK candidaturas.provincia_id).
-- -----------------------------------------------------------------------------
create index candidaturas_provincia_id_idx on public.candidaturas (provincia_id);
