-- =============================================================================
-- Pruebas de RLS de la Fase 2 (PROJECT_SPEC §4.13): cada rol, y cuentas activas,
-- inactivas y con clave temporal. Simula sesiones como PostgREST:
-- `set local role authenticated|anon` + `request.jwt.claims` con el `sub`.
-- Corre en una transacción y termina en ROLLBACK. Requiere el seed cargado.
--
-- Personas:  P1 provincial activo · P2 provincial inactivo · P3 provincial con clave temporal
--            C1 coordinador de r1 · C2 coordinador de r2 · C3 coordinador sin recinto (creado por P1)
--            V1 veedor r1 en m1 · V2 veedor r1 sin mesa · V3 veedor r2 en m3
--            V4 veedor r1 en m2 con clave temporal · V5 veedor r1 en m4 inactivo
-- Recintos:  r1 = 989 (19 mesas) · r2 = 1007 (10 mesas). m1 = 989-1F, m2 = 989-1M, m4 = 989-2F, m3 = 1007-1F
-- =============================================================================
begin;

create temporary table resultados (n serial, caso text, ok boolean, detalle text) on commit drop;
create temporary table ctx (k text primary key, v uuid) on commit drop;

create function pg_temp.es(caso text, condicion boolean) returns void
language sql as $$ insert into resultados (caso, ok, detalle) values (caso, coalesce(condicion, false), ''); $$;

create function pg_temp.id(clave text) returns uuid language sql stable as $$ select v from ctx where k = clave $$;

-- Cuenta las filas de `consulta` como `uid` (null = anon) y compara con `esperado`.
create function pg_temp.ver(caso text, uid uuid, consulta text, esperado bigint) returns void
language plpgsql as $$
declare n bigint;
begin
  begin
    perform set_config('request.jwt.claims',
      coalesce(json_build_object('sub', uid, 'role', 'authenticated')::text, '{"role":"anon"}'), true);
    execute case when uid is null then 'set local role anon' else 'set local role authenticated' end;
    execute 'select count(*) from (' || consulta || ') q' into n;
    execute 'reset role';
    insert into resultados (caso, ok, detalle) values (caso, n = esperado, format('obtenido %s, esperado %s', n, esperado));
  exception when others then
    insert into resultados (caso, ok, detalle) values (caso, false, 'error: ' || sqlerrm);
  end;
end $$;

-- Ejecuta `sentencia` como `uid`. esperado = 'ok', un SQLSTATE o un HINT.
create function pg_temp.intenta(caso text, uid uuid, sentencia text, esperado text) returns void
language plpgsql as $$
declare v_state text; v_hint text; v_msg text;
begin
  begin
    perform set_config('request.jwt.claims',
      coalesce(json_build_object('sub', uid, 'role', 'authenticated')::text, '{"role":"anon"}'), true);
    execute case when uid is null then 'set local role anon' else 'set local role authenticated' end;
    execute sentencia;
    set constraints all immediate;
    set constraints all deferred;
    execute 'reset role';
    insert into resultados (caso, ok, detalle) values (caso, 'ok' = any (string_to_array(esperado, '|')), 'se ejecutó');
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
    insert into resultados (caso, ok, detalle)
    values (caso, v_state = any (string_to_array(esperado, '|')) or coalesce(v_hint, '') = any (string_to_array(esperado, '|')),
            coalesce(nullif(v_hint, ''), v_state) || ': ' || v_msg);
  end;
end $$;

-- Sentencia de alta de acta (votos iguales por lista) con los ids ya resueltos.
create function pg_temp.sql_acta(acta uuid, mesa uuid, dignidad text, veedor uuid, votos int, total int) returns text
language sql stable as $$
  select format($f$
    insert into public.actas (id, mesa_id, dignidad, veedor_id, votos_nulos, votos_blancos, total_sufragantes,
                              confirmada_en, foto_path, lat, lng, precision_m, ubicacion_simulada, capturada_en)
    values (%1$L, %2$L, %3$L, %4$L, 0, 0, %6$s, now(), %2$L || '/' || %3$L || '.jpg', 0.3, -78.26, 6, false, now());
    insert into public.votos_acta (acta_id, candidatura_id, votos)
    select %1$L, k.id, %5$s from public.candidaturas k where k.dignidad = %3$L;$f$,
    acta, mesa, dignidad, veedor, votos, total);
$$;

-- ---------------------------------------------------------------------------
-- Datos de prueba (como postgres)
-- ---------------------------------------------------------------------------
insert into ctx values
  ('P1', '00000000-0000-4000-8000-000000000101'), ('P2', '00000000-0000-4000-8000-000000000102'),
  ('P3', '00000000-0000-4000-8000-000000000103'), ('C1', '00000000-0000-4000-8000-000000000201'),
  ('C2', '00000000-0000-4000-8000-000000000202'), ('C3', '00000000-0000-4000-8000-000000000203'),
  ('V1', '00000000-0000-4000-8000-000000000301'), ('V2', '00000000-0000-4000-8000-000000000302'),
  ('V3', '00000000-0000-4000-8000-000000000303'), ('V4', '00000000-0000-4000-8000-000000000304'),
  ('V5', '00000000-0000-4000-8000-000000000305'),
  ('A1', '00000000-0000-4000-9000-000000000001'), ('A2', '00000000-0000-4000-9000-000000000002');
insert into ctx
select 'r1', id from public.recintos where codigo = '989' union all
select 'r2', id from public.recintos where codigo = '1007' union all
select 'm1', m.id from public.mesas m join public.recintos r on r.id = m.recinto_id where r.codigo = '989' and m.numero = 1 and m.sexo = 'F' union all
select 'm2', m.id from public.mesas m join public.recintos r on r.id = m.recinto_id where r.codigo = '989' and m.numero = 1 and m.sexo = 'M' union all
select 'm4', m.id from public.mesas m join public.recintos r on r.id = m.recinto_id where r.codigo = '989' and m.numero = 2 and m.sexo = 'F' union all
select 'm3', m.id from public.mesas m join public.recintos r on r.id = m.recinto_id where r.codigo = '1007' and m.numero = 1 and m.sexo = 'F';

insert into auth.users (id, email)
select v, lower(k) || '@rls.test' from ctx where k ~ '^[PCV][0-9]$';

insert into public.perfiles (id, cedula, nombres, apellidos, telefono, correo, rol, activo, debe_cambiar_clave, creado_por)
select pg_temp.id(k), cedula, 'Prueba', 'Persona', '0990000000', lower(k) || '@rls.test', rol, activo, temporal,
       case when k = 'C3' then pg_temp.id('P1') end
  from (values
    ('P1', '1001000015', 'coordinador_provincial', true,  false),
    ('P2', '1001000023', 'coordinador_provincial', false, false),
    ('P3', '1001000031', 'coordinador_provincial', true,  true),
    ('C1', '1001000049', 'coordinador_recinto',    true,  false),
    ('C2', '1001000056', 'coordinador_recinto',    true,  false),
    ('C3', '1001000064', 'coordinador_recinto',    true,  false),
    ('V1', '1001000072', 'veedor',                 true,  false),
    ('V2', '1001000080', 'veedor',                 true,  false),
    ('V3', '1001000098', 'veedor',                 true,  false),
    ('V4', '1001000106', 'veedor',                 true,  true),
    ('V5', '1001000114', 'veedor',                 false, false)
  ) as t(k, cedula, rol, activo, temporal);

insert into public.coordinaciones_provinciales (coordinador_id, provincia_id)
select pg_temp.id(k), 10 from unnest(array['P1', 'P2', 'P3']) k;
insert into public.coordinaciones_recinto (recinto_id, coordinador_id, asignado_por) values
  (pg_temp.id('r1'), pg_temp.id('C1'), pg_temp.id('P1')),
  (pg_temp.id('r2'), pg_temp.id('C2'), pg_temp.id('P1'));
insert into public.veedores_recinto (veedor_id, recinto_id, registrado_por)
select pg_temp.id(v), pg_temp.id(r), pg_temp.id('P1')
  from (values ('V1', 'r1'), ('V2', 'r1'), ('V4', 'r1'), ('V5', 'r1'), ('V3', 'r2')) t(v, r);
insert into public.asignaciones_mesa (mesa_id, veedor_id, asignado_por)
select pg_temp.id(m), pg_temp.id(v), pg_temp.id(c)
  from (values ('m1', 'V1', 'C1'), ('m2', 'V4', 'C1'), ('m4', 'V5', 'C1'), ('m3', 'V3', 'C2')) t(m, v, c);

-- Acta A1: alcaldía de m1 registrada por V1 (5 listas × 20 = 100).
do $$ begin execute pg_temp.sql_acta(pg_temp.id('A1'), pg_temp.id('m1'), 'alcaldia', pg_temp.id('V1'), 20, 100); end $$;
set constraints all immediate;
set constraints all deferred;
insert into storage.objects (bucket_id, name) values ('actas', pg_temp.id('m1') || '/alcaldia.jpg');

-- ---------------------------------------------------------------------------
-- 1. anon: nada
-- ---------------------------------------------------------------------------
select pg_temp.intenta('anon no lee perfiles', null, 'select * from public.perfiles', '42501');
select pg_temp.intenta('anon no lee candidaturas', null, 'select * from public.candidaturas', '42501');
select pg_temp.intenta('anon no lee actas', null, 'select * from public.actas', '42501');
select pg_temp.ver('anon no ve fotos', null, $$select 1 from storage.objects where bucket_id = 'actas'$$, 0);

-- ---------------------------------------------------------------------------
-- 2. Estados de cuenta (ADR-02, ADR-03, D-22)
-- ---------------------------------------------------------------------------
select pg_temp.ver('P2 inactivo: ve su propio perfil', pg_temp.id('P2'), 'select 1 from public.perfiles', 1);
select pg_temp.ver('P2 inactivo: sin catálogo', pg_temp.id('P2'), 'select 1 from public.candidaturas', 0);
select pg_temp.ver('P2 inactivo: sin recintos', pg_temp.id('P2'), 'select 1 from public.recintos', 0);
select pg_temp.ver('P3 clave temporal: ve su propio perfil', pg_temp.id('P3'), 'select 1 from public.perfiles where debe_cambiar_clave', 1);
select pg_temp.ver('P3 clave temporal: sin catálogo', pg_temp.id('P3'), 'select 1 from public.provincias', 0);
select pg_temp.ver('P3 clave temporal: sin recintos', pg_temp.id('P3'), 'select 1 from public.recintos', 0);
select pg_temp.ver('P3 clave temporal: sin actas', pg_temp.id('P3'), 'select 1 from public.actas', 0);
select pg_temp.ver('V4 clave temporal: sin mesa', pg_temp.id('V4'), 'select 1 from public.mesas', 0);
select pg_temp.ver('V4 clave temporal: sin asignación', pg_temp.id('V4'), 'select 1 from public.asignaciones_mesa', 0);
select pg_temp.ver('V5 inactivo: sin mesa', pg_temp.id('V5'), 'select 1 from public.mesas', 0);
select pg_temp.intenta('V4 clave temporal no registra acta', pg_temp.id('V4'),
  pg_temp.sql_acta(gen_random_uuid(), pg_temp.id('m2'), 'alcaldia', pg_temp.id('V4'), 20, 100), '42501');
select pg_temp.intenta('nadie cambia su debe_cambiar_clave', pg_temp.id('V4'),
  format('update public.perfiles set debe_cambiar_clave = false where id = %L', pg_temp.id('V4')), '42501');
select pg_temp.intenta('nadie se reactiva', pg_temp.id('V5'),
  format('update public.perfiles set activo = true where id = %L', pg_temp.id('V5')), '42501');

-- ---------------------------------------------------------------------------
-- 3. Coordinador provincial (jurisdicción Imbabura)
-- ---------------------------------------------------------------------------
select pg_temp.ver('P1 ve los 24 recintos', pg_temp.id('P1'), 'select 1 from public.recintos', 24);
select pg_temp.ver('P1 ve las 144 mesas', pg_temp.id('P1'), 'select 1 from public.mesas', 144);
select pg_temp.ver('P1 ve las 9 candidaturas', pg_temp.id('P1'), 'select 1 from public.candidaturas', 9);
select pg_temp.ver('P1 ve el acta A1 y sus 5 votos', pg_temp.id('P1'), 'select 1 from public.votos_acta', 5);
select pg_temp.ver('P1 ve 9 personas (él, C3 que creó, C1, C2, V1–V5)', pg_temp.id('P1'), 'select 1 from public.perfiles', 9);
select pg_temp.ver('P1 no ve a otros provinciales', pg_temp.id('P1'), $$select 1 from public.perfiles where rol = 'coordinador_provincial'$$, 1);
select pg_temp.ver('P1 ve las 4 asignaciones', pg_temp.id('P1'), 'select 1 from public.asignaciones_mesa', 4);
select pg_temp.ver('P1 ve la foto de A1', pg_temp.id('P1'), $$select 1 from storage.objects where bucket_id = 'actas'$$, 1);
select pg_temp.intenta('P1 da de alta un recinto en su jurisdicción', pg_temp.id('P1'),
  format($$insert into public.recintos (parroquia_id, codigo, nombre, codigo_zona, lat, lng, creado_por)
          values (5910, '999901', 'Recinto de prueba', 0, 0.3, -78.26, %L)$$, pg_temp.id('P1')), 'ok');
select pg_temp.intenta('P1 no firma un recinto a nombre de otro', pg_temp.id('P1'),
  format($$insert into public.recintos (parroquia_id, codigo, nombre, codigo_zona, lat, lng, creado_por)
          values (5910, '999902', 'Recinto de prueba', 0, 0.3, -78.26, %L)$$, pg_temp.id('C1')), '42501');
select pg_temp.intenta('P1 agrega una mesa a un recinto', pg_temp.id('P1'),
  format($$insert into public.mesas (recinto_id, numero, sexo) values (%L, 30, 'F')$$, pg_temp.id('r1')), 'ok');
select pg_temp.intenta('P1 no registra actas', pg_temp.id('P1'),
  pg_temp.sql_acta(gen_random_uuid(), pg_temp.id('m2'), 'alcaldia', pg_temp.id('P1'), 20, 100), '42501');
select pg_temp.intenta('P1 no asigna directamente (solo por RPC)', pg_temp.id('P1'),
  format($$insert into public.asignaciones_mesa (mesa_id, veedor_id, asignado_por) values (%L, %L, %L)$$,
         pg_temp.id('m3'), pg_temp.id('V2'), pg_temp.id('P1')), '42501');

-- ---------------------------------------------------------------------------
-- 4. Coordinador de recinto
-- ---------------------------------------------------------------------------
select pg_temp.ver('C1 ve solo su recinto', pg_temp.id('C1'), 'select 1 from public.recintos', 1);
select pg_temp.ver('C1 ve las 20 mesas de r1 (19 + la nueva)', pg_temp.id('C1'), 'select 1 from public.mesas', 20);
select pg_temp.ver('C1 ve el acta A1', pg_temp.id('C1'), 'select 1 from public.actas', 1);
select pg_temp.ver('C1 ve 5 personas (él y V1, V2, V4, V5)', pg_temp.id('C1'), 'select 1 from public.perfiles', 5);
select pg_temp.ver('C1 ve las 3 asignaciones de r1', pg_temp.id('C1'), 'select 1 from public.asignaciones_mesa', 3);
select pg_temp.ver('C1 ve la foto de A1', pg_temp.id('C1'), $$select 1 from storage.objects where bucket_id = 'actas'$$, 1);
select pg_temp.ver('C2 ve solo su recinto y sus 10 mesas', pg_temp.id('C2'), 'select 1 from public.mesas', 10);
select pg_temp.ver('C2 no ve actas de otro recinto', pg_temp.id('C2'), 'select 1 from public.actas', 0);
select pg_temp.ver('C2 ve 2 personas (él y V3)', pg_temp.id('C2'), 'select 1 from public.perfiles', 2);
select pg_temp.ver('C2 no ve la foto de r1', pg_temp.id('C2'), $$select 1 from storage.objects where bucket_id = 'actas'$$, 0);
select pg_temp.ver('C3 sin recinto: no ve recintos', pg_temp.id('C3'), 'select 1 from public.recintos', 0);
select pg_temp.ver('C3 sin recinto: sí ve el catálogo', pg_temp.id('C3'), 'select 1 from public.candidaturas', 9);
select pg_temp.intenta('C1 no registra actas', pg_temp.id('C1'),
  pg_temp.sql_acta(gen_random_uuid(), pg_temp.id('m2'), 'alcaldia', pg_temp.id('C1'), 20, 100), '42501');
select pg_temp.intenta('C1 no crea mesas', pg_temp.id('C1'),
  format($$insert into public.mesas (recinto_id, numero, sexo) values (%L, 31, 'F')$$, pg_temp.id('r1')), '42501');
select pg_temp.intenta('C1 no edita actas (S-07)', pg_temp.id('C1'),
  format('update public.actas set votos_nulos = 1 where id = %L', pg_temp.id('A1')), '42501');

-- ---------------------------------------------------------------------------
-- 5. Veedor
-- ---------------------------------------------------------------------------
select pg_temp.ver('V1 ve solo su mesa', pg_temp.id('V1'), 'select 1 from public.mesas', 1);
select pg_temp.ver('V1 ve solo su recinto', pg_temp.id('V1'), 'select 1 from public.recintos', 1);
select pg_temp.ver('V1 ve su acta', pg_temp.id('V1'), 'select 1 from public.actas', 1);
select pg_temp.ver('V1 ve solo su perfil', pg_temp.id('V1'), 'select 1 from public.perfiles', 1);
select pg_temp.ver('V1 ve su asignación vigente', pg_temp.id('V1'), 'select 1 from public.asignaciones_mesa', 1);
select pg_temp.ver('V1 ve el catálogo (offline)', pg_temp.id('V1'), 'select 1 from public.candidaturas', 9);
select pg_temp.ver('V1 no ve coordinaciones', pg_temp.id('V1'), 'select 1 from public.coordinaciones_recinto', 0);
select pg_temp.ver('V3 no ve el acta de otra mesa', pg_temp.id('V3'), 'select 1 from public.actas', 0);
select pg_temp.ver('V3 no ve la foto de otra mesa', pg_temp.id('V3'), $$select 1 from storage.objects where bucket_id = 'actas'$$, 0);
select pg_temp.ver('V2 sin mesa: no ve mesas', pg_temp.id('V2'), 'select 1 from public.mesas', 0);

select pg_temp.intenta('V1 sube la foto de prefectura de su mesa', pg_temp.id('V1'),
  format($$insert into storage.objects (bucket_id, name) values ('actas', %L)$$, pg_temp.id('m1') || '/prefectura.jpg'), 'ok');
select pg_temp.intenta('V1 no sube fotos a otra mesa', pg_temp.id('V1'),
  format($$insert into storage.objects (bucket_id, name) values ('actas', %L)$$, pg_temp.id('m3') || '/alcaldia.jpg'), '42501');
select pg_temp.intenta('V1 no sube fotos con otro nombre', pg_temp.id('V1'),
  format($$insert into storage.objects (bucket_id, name) values ('actas', %L)$$, pg_temp.id('m1') || '/otra.jpg'), '42501');
select pg_temp.intenta('V1 intenta sobrescribir la foto (sin política: 0 filas o rechazo)', pg_temp.id('V1'),
  format($$update storage.objects set metadata = '{"x":1}' where bucket_id = 'actas' and name = %L$$, pg_temp.id('m1') || '/alcaldia.jpg'), 'ok|42501');
select pg_temp.intenta('V1 intenta borrar la foto (sin política: 0 filas o rechazo)', pg_temp.id('V1'),
  format($$delete from storage.objects where bucket_id = 'actas' and name = %L$$, pg_temp.id('m1') || '/alcaldia.jpg'), 'ok|42501');
select pg_temp.es('la foto de A1 sigue intacta (ADR-14)',
  (select metadata is distinct from '{"x":1}'::jsonb from storage.objects where bucket_id = 'actas' and name = pg_temp.id('m1') || '/alcaldia.jpg'));

select pg_temp.intenta('V1: un acta que no cuadra la rechaza la base aunque pase RLS', pg_temp.id('V1'),
  pg_temp.sql_acta(gen_random_uuid(), pg_temp.id('m1'), 'prefectura', pg_temp.id('V1'), 10, 41), 'suma_no_cuadra');
select pg_temp.intenta('V1 registra el acta de prefectura de su mesa', pg_temp.id('V1'),
  pg_temp.sql_acta(pg_temp.id('A2'), pg_temp.id('m1'), 'prefectura', pg_temp.id('V1'), 10, 40), 'ok');
select pg_temp.intenta('V1 no registra en otra mesa', pg_temp.id('V1'),
  pg_temp.sql_acta(gen_random_uuid(), pg_temp.id('m3'), 'alcaldia', pg_temp.id('V1'), 20, 100), '42501');
select pg_temp.intenta('V1 no registra a nombre de otro veedor', pg_temp.id('V1'),
  pg_temp.sql_acta(gen_random_uuid(), pg_temp.id('m1'), 'prefectura', pg_temp.id('V2'), 10, 40), '42501');
select pg_temp.intenta('V1 no elige el estado del acta', pg_temp.id('V1'),
  format($$insert into public.actas (id, mesa_id, dignidad, veedor_id, votos_nulos, votos_blancos, total_sufragantes, estado)
          values (gen_random_uuid(), %L, 'prefectura', %L, 0, 0, 0, 'borrador')$$, pg_temp.id('m1'), pg_temp.id('V1')), '42501');
select pg_temp.intenta('V1 no registra una segunda acta de prefectura', pg_temp.id('V1'),
  pg_temp.sql_acta(gen_random_uuid(), pg_temp.id('m1'), 'prefectura', pg_temp.id('V1'), 10, 40), '23505');
select pg_temp.intenta('V1 no edita su acta (RF-14)', pg_temp.id('V1'),
  format('update public.actas set votos_nulos = 1 where id = %L', pg_temp.id('A1')), '42501');
select pg_temp.intenta('V1 no borra su acta', pg_temp.id('V1'),
  format('delete from public.actas where id = %L', pg_temp.id('A1')), '42501');
select pg_temp.intenta('V1 no edita votos', pg_temp.id('V1'),
  format('update public.votos_acta set votos = 0 where acta_id = %L', pg_temp.id('A1')), '42501');
select pg_temp.ver('V1 ve sus 2 actas', pg_temp.id('V1'), 'select 1 from public.actas', 2);

-- ---------------------------------------------------------------------------
-- 6. Reemplazo: el ausente pierde el acceso al instante (ADR-10)
-- ---------------------------------------------------------------------------
update public.asignaciones_mesa set hasta = now() where veedor_id = pg_temp.id('V1') and hasta is null;
insert into public.asignaciones_mesa (mesa_id, veedor_id, asignado_por) values (pg_temp.id('m1'), pg_temp.id('V2'), pg_temp.id('C1'));
select pg_temp.ver('V1 reemplazado: ya no ve la mesa', pg_temp.id('V1'), 'select 1 from public.mesas', 0);
select pg_temp.ver('V1 reemplazado: ya no ve las actas', pg_temp.id('V1'), 'select 1 from public.actas', 0);
select pg_temp.ver('V2 nuevo veedor: ve las actas previas de la mesa', pg_temp.id('V2'), 'select 1 from public.actas', 2);
select pg_temp.es('las actas previas conservan su autor (V1)', (select count(*) = 2 from public.actas where veedor_id = pg_temp.id('V1')));
select pg_temp.ver('V2 ve las fotos de la mesa', pg_temp.id('V2'), $$select 1 from storage.objects where bucket_id = 'actas'$$, 2);

-- ---------------------------------------------------------------------------
-- Resultado
-- ---------------------------------------------------------------------------
select count(*) filter (where ok) as aprobadas, count(*) filter (where not ok) as fallidas,
       coalesce(string_agg(caso || ' → ' || detalle, E'\n' order by n) filter (where not ok), '') as detalle_fallidas
  from resultados;

rollback;
