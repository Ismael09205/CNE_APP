-- =============================================================================
-- Pruebas de la Fase 6: RPC registrar_acta y fotos en Storage (F9, F10).
-- Decisiones F6-5 (vigencia en confirmada_en), F6-6 (foto primero; huérfana
-- reemplazable por el veedor vigente) y F6-7 (5 minutos de tolerancia).
-- Corre en una transacción y termina en ROLLBACK. Requiere el seed cargado.
--
-- Personas:  P1 provincial · C1 coordinador r1 · C2 coordinador r2
--            V1 veedor r1 en m1 (reemplazado luego por V2) · V2 veedor r1
--            V3 veedor r2 en m3 (reemplazado luego por V6) · V6 veedor r2
--            V4 veedor r1 en m2 con clave temporal
-- =============================================================================
begin;

create temporary table resultados (n serial, caso text, ok boolean, detalle text) on commit drop;
create temporary table ctx (k text primary key, v uuid) on commit drop;

create function pg_temp.es(caso text, condicion boolean) returns void
language sql as $$ insert into resultados (caso, ok, detalle) values (caso, coalesce(condicion, false), ''); $$;

create function pg_temp.id(clave text) returns uuid language sql stable as $$ select v from ctx where k = clave $$;

-- Ejecuta `sentencia` como `uid` (null = anon) y devuelve 'ok', el HINT o el SQLSTATE.
create function pg_temp.como(uid uuid, sentencia text) returns text
language plpgsql as $$
declare v_state text; v_hint text; r text;
begin
  begin
    perform set_config('request.jwt.claims',
      coalesce(json_build_object('sub', uid, 'role', 'authenticated')::text, '{"role":"anon"}'), true);
    execute case when uid is null then 'set local role anon' else 'set local role authenticated' end;
    execute sentencia into r;
    execute 'reset role';
    return coalesce(r, 'ok');
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_hint = pg_exception_hint;
    execute 'reset role';
    -- Los rechazos de reglas (check_violation) traen un hint estable; el resto, su SQLSTATE.
    return case when v_state = '23514' then coalesce(nullif(v_hint, ''), v_state) else v_state end;
  end;
end $$;

create function pg_temp.espera(caso text, obtenido text, esperado text) returns void
language sql as $$
  insert into resultados (caso, ok, detalle)
  values (caso, obtenido = any (string_to_array(esperado, '|')), format('obtenido %s, esperado %s', obtenido, esperado));
$$;

-- JSON del acta (votos iguales por lista). `cambios` sobrescribe campos.
create function pg_temp.acta(acta uuid, mesa uuid, dignidad text, votos int, total int,
                             confirmada timestamptz default now(), cambios jsonb default '{}') returns jsonb
language sql stable as $$
  select jsonb_build_object('id', acta, 'mesa_id', mesa, 'dignidad', dignidad, 'votos_nulos', 0, 'votos_blancos', 0,
      'total_sufragantes', total, 'confirmada_en', confirmada, 'capturada_en', confirmada - interval '1 minute',
      'lat', 0.3, 'lng', -78.26, 'precision_m', 6, 'ubicacion_simulada', false,
      'votos', (select jsonb_agg(jsonb_build_object('candidatura_id', k.id, 'votos', votos))
                  from public.candidaturas k where k.dignidad = acta.dignidad)) || cambios;
$$;

create function pg_temp.rpc(uid uuid, acta jsonb) returns text
language sql as $$ select pg_temp.como(uid, format('select public.registrar_acta(%L::jsonb)', acta)); $$;

create function pg_temp.subir(uid uuid, nombre text) returns text
language sql as $$
  select pg_temp.como(uid, format($f$insert into storage.objects (bucket_id, name, owner_id) values ('actas', %L, %L) returning 'ok'$f$,
                                  nombre, uid));
$$;

-- ---------------------------------------------------------------------------
-- Datos de prueba (como postgres)
-- ---------------------------------------------------------------------------
insert into ctx values
  ('P1', '00000000-0000-4000-8000-000000000101'), ('C1', '00000000-0000-4000-8000-000000000201'),
  ('C2', '00000000-0000-4000-8000-000000000202'),
  ('V1', '00000000-0000-4000-8000-000000000301'), ('V2', '00000000-0000-4000-8000-000000000302'),
  ('V3', '00000000-0000-4000-8000-000000000303'), ('V4', '00000000-0000-4000-8000-000000000304'),
  ('V6', '00000000-0000-4000-8000-000000000306'),
  ('A1', '00000000-0000-4000-9000-000000000001'), ('A2', '00000000-0000-4000-9000-000000000002'),
  ('A3', '00000000-0000-4000-9000-000000000003');
insert into ctx
select 'm1', m.id from public.mesas m join public.recintos r on r.id = m.recinto_id where r.codigo = '989' and m.numero = 1 and m.sexo = 'F' union all
select 'm2', m.id from public.mesas m join public.recintos r on r.id = m.recinto_id where r.codigo = '989' and m.numero = 1 and m.sexo = 'M' union all
select 'm3', m.id from public.mesas m join public.recintos r on r.id = m.recinto_id where r.codigo = '1007' and m.numero = 1 and m.sexo = 'F' union all
select 'r1', id from public.recintos where codigo = '989' union all
select 'r2', id from public.recintos where codigo = '1007';

insert into auth.users (id, email) select v, lower(k) || '@actas.test' from ctx where k ~ '^[PCV][0-9]$';
insert into public.perfiles (id, cedula, nombres, apellidos, telefono, correo, rol, debe_cambiar_clave)
select pg_temp.id(k), cedula, 'Prueba', 'Persona', '0990000000', lower(k) || '@actas.test', rol, temporal
  from (values
    ('P1', '1001000015', 'coordinador_provincial', false),
    ('C1', '1001000049', 'coordinador_recinto',    false),
    ('C2', '1001000056', 'coordinador_recinto',    false),
    ('V1', '1001000072', 'veedor',                 false),
    ('V2', '1001000080', 'veedor',                 false),
    ('V3', '1001000098', 'veedor',                 false),
    ('V4', '1001000106', 'veedor',                 true),
    ('V6', '1001000122', 'veedor',                 false)
  ) as t(k, cedula, rol, temporal);
insert into public.coordinaciones_provinciales (coordinador_id, provincia_id) values (pg_temp.id('P1'), 10);
insert into public.coordinaciones_recinto (recinto_id, coordinador_id, asignado_por) values
  (pg_temp.id('r1'), pg_temp.id('C1'), pg_temp.id('P1')), (pg_temp.id('r2'), pg_temp.id('C2'), pg_temp.id('P1'));
insert into public.veedores_recinto (veedor_id, recinto_id, registrado_por)
select pg_temp.id(v), pg_temp.id(r), pg_temp.id('P1')
  from (values ('V1', 'r1'), ('V2', 'r1'), ('V4', 'r1'), ('V3', 'r2'), ('V6', 'r2')) t(v, r);
-- Asignaciones desde hace 2 horas (confirmada_en debe caer dentro de la vigencia).
insert into public.asignaciones_mesa (mesa_id, veedor_id, asignado_por, desde)
select pg_temp.id(m), pg_temp.id(v), pg_temp.id(c), now() - interval '2 hours'
  from (values ('m1', 'V1', 'C1'), ('m2', 'V4', 'C1'), ('m3', 'V3', 'C2')) t(m, v, c);

-- ---------------------------------------------------------------------------
-- 1. Quién puede llamar
-- ---------------------------------------------------------------------------
select pg_temp.espera('anon no llama a la RPC', pg_temp.rpc(null, pg_temp.acta(gen_random_uuid(), pg_temp.id('m1'), 'alcaldia', 20, 100)), '42501');
select pg_temp.espera('provincial no registra actas', pg_temp.rpc(pg_temp.id('P1'), pg_temp.acta(gen_random_uuid(), pg_temp.id('m1'), 'alcaldia', 20, 100)), 'no_autorizado');
select pg_temp.espera('coordinador no registra actas', pg_temp.rpc(pg_temp.id('C1'), pg_temp.acta(gen_random_uuid(), pg_temp.id('m1'), 'alcaldia', 20, 100)), 'no_autorizado');
select pg_temp.espera('veedor con clave temporal no registra', pg_temp.rpc(pg_temp.id('V4'), pg_temp.acta(gen_random_uuid(), pg_temp.id('m2'), 'alcaldia', 20, 100)), 'no_autorizado');

-- ---------------------------------------------------------------------------
-- 2. Fotos: subida (F6-6)
-- ---------------------------------------------------------------------------
select pg_temp.espera('V1 sin foto → foto_faltante', pg_temp.rpc(pg_temp.id('V1'), pg_temp.acta(pg_temp.id('A1'), pg_temp.id('m1'), 'alcaldia', 20, 100)), 'foto_faltante');
select pg_temp.espera('V3 no sube fotos a una mesa que nunca tuvo', pg_temp.subir(pg_temp.id('V3'), pg_temp.id('m1') || '/alcaldia.jpg'), '42501');
select pg_temp.espera('V2 sin mesa no sube fotos', pg_temp.subir(pg_temp.id('V2'), pg_temp.id('m1') || '/alcaldia.jpg'), '42501');
select pg_temp.espera('V1 no sube con otro nombre', pg_temp.subir(pg_temp.id('V1'), pg_temp.id('m1') || '/otra.jpg'), '42501');
select pg_temp.espera('V1 no sube a subcarpetas', pg_temp.subir(pg_temp.id('V1'), pg_temp.id('m1') || '/x/alcaldia.jpg'), '42501');
select pg_temp.espera('V1 sube la foto de alcaldía de su mesa', pg_temp.subir(pg_temp.id('V1'), pg_temp.id('m1') || '/alcaldia.jpg'), 'ok');
select pg_temp.espera('V1 ve su propia foto', pg_temp.como(pg_temp.id('V1'),
  format($$select count(*)::text from storage.objects where bucket_id = 'actas' and name = %L$$, pg_temp.id('m1') || '/alcaldia.jpg')), '1');

-- ---------------------------------------------------------------------------
-- 3. Validaciones de la RPC
-- ---------------------------------------------------------------------------
select pg_temp.espera('reloj 10 min adelantado → hora_invalida',
  pg_temp.rpc(pg_temp.id('V1'), pg_temp.acta(pg_temp.id('A1'), pg_temp.id('m1'), 'alcaldia', 20, 100, now() + interval '10 minutes')), 'hora_invalida');
select pg_temp.espera('foto capturada después de confirmar → hora_invalida',
  pg_temp.rpc(pg_temp.id('V1'), pg_temp.acta(pg_temp.id('A1'), pg_temp.id('m1'), 'alcaldia', 20, 100, now(),
    jsonb_build_object('capturada_en', now() + interval '1 minute'))), 'hora_invalida');
select pg_temp.espera('dignidad inválida → datos_invalidos',
  pg_temp.rpc(pg_temp.id('V1'), pg_temp.acta(pg_temp.id('A1'), pg_temp.id('m1'), 'alcaldia', 20, 100) || '{"dignidad":"concejales"}'), 'datos_invalidos');
select pg_temp.espera('id no UUID → datos_invalidos',
  pg_temp.rpc(pg_temp.id('V1'), pg_temp.acta(pg_temp.id('A1'), pg_temp.id('m1'), 'alcaldia', 20, 100) || '{"id":"abc"}'), 'datos_invalidos');
select pg_temp.espera('más de 3 dígitos → rechazo (F6-8)',
  pg_temp.rpc(pg_temp.id('V1'), pg_temp.acta(pg_temp.id('A1'), pg_temp.id('m1'), 'alcaldia', 200, 1000)), '23514|total_mayor_que_maximo');
select pg_temp.espera('votos negativos → datos_invalidos o CHECK',
  pg_temp.rpc(pg_temp.id('V1'), pg_temp.acta(pg_temp.id('A1'), pg_temp.id('m1'), 'alcaldia', 20, 100) || '{"votos_nulos":-1}'), 'datos_invalidos|23514');
select pg_temp.espera('suma que no cuadra → suma_no_cuadra',
  pg_temp.rpc(pg_temp.id('V1'), pg_temp.acta(pg_temp.id('A1'), pg_temp.id('m1'), 'alcaldia', 20, 99)), 'suma_no_cuadra');
select pg_temp.espera('faltan listas → candidatura_faltante',
  pg_temp.rpc(pg_temp.id('V1'), pg_temp.acta(pg_temp.id('A1'), pg_temp.id('m1'), 'alcaldia', 0, 0) || '{"votos":[]}'), 'candidatura_faltante');
select pg_temp.es('ningún intento fallido dejó actas', (select count(*) = 0 from public.actas where mesa_id = pg_temp.id('m1')));

-- ---------------------------------------------------------------------------
-- 4. Alta, reintento y conflicto (ADR-15)
-- ---------------------------------------------------------------------------
select pg_temp.espera('V1 registra el acta de alcaldía', pg_temp.rpc(pg_temp.id('V1'), pg_temp.acta(pg_temp.id('A1'), pg_temp.id('m1'), 'alcaldia', 20, 100)), 'guardada');
select pg_temp.es('…con estado enviada, foto y 5 votos',
  (select a.estado = 'enviada' and a.foto_path = pg_temp.id('m1') || '/alcaldia.jpg' and a.veedor_id = pg_temp.id('V1')
          and (select count(*) from public.votos_acta v where v.acta_id = a.id) = 5
     from public.actas a where a.id = pg_temp.id('A1')));
select pg_temp.espera('reintento con el mismo UUID → ya_guardada', pg_temp.rpc(pg_temp.id('V1'), pg_temp.acta(pg_temp.id('A1'), pg_temp.id('m1'), 'alcaldia', 20, 100)), 'ya_guardada');
select pg_temp.espera('otra acta de la misma mesa y dignidad → conflicto', pg_temp.rpc(pg_temp.id('V1'), pg_temp.acta(gen_random_uuid(), pg_temp.id('m1'), 'alcaldia', 10, 50)), 'conflicto');
select pg_temp.espera('UUID ya usado en otra mesa → conflicto', pg_temp.rpc(pg_temp.id('V3'), pg_temp.acta(pg_temp.id('A1'), pg_temp.id('m3'), 'alcaldia', 20, 100)), 'conflicto');
select pg_temp.es('el acta original no cambió', (select total_sufragantes = 100 from public.actas where id = pg_temp.id('A1')));
select pg_temp.espera('con acta registrada ya no se sube otra foto', pg_temp.subir(pg_temp.id('V1'), pg_temp.id('m1') || '/alcaldia.jpg'), '42501|23505');
select pg_temp.espera('V1 no edita la foto del acta registrada', pg_temp.como(pg_temp.id('V1'),
  format($$with u as (update storage.objects set metadata = '{"x":1}' where bucket_id = 'actas' and name = %L returning 1)
           select count(*)::text from u$$, pg_temp.id('m1') || '/alcaldia.jpg')), '0');

-- ---------------------------------------------------------------------------
-- 5. Reemplazo antes de sincronizar (F6-5) y foto huérfana (F6-6)
-- ---------------------------------------------------------------------------
-- Hace 30 minutos: V1 → V2 en m1 y V3 → V6 en m3.
update public.asignaciones_mesa set hasta = now() - interval '30 minutes'
 where veedor_id in (pg_temp.id('V1'), pg_temp.id('V3')) and hasta is null;
insert into public.asignaciones_mesa (mesa_id, veedor_id, asignado_por, desde) values
  (pg_temp.id('m1'), pg_temp.id('V2'), pg_temp.id('C1'), now() - interval '30 minutes'),
  (pg_temp.id('m3'), pg_temp.id('V6'), pg_temp.id('C2'), now() - interval '30 minutes');

-- V3 confirmó hace 1 hora (vigente) y sincroniza ahora: se acepta.
select pg_temp.espera('V3 reemplazado sube la foto de un acta confirmada a tiempo', pg_temp.subir(pg_temp.id('V3'), pg_temp.id('m3') || '/alcaldia.jpg'), 'ok');
select pg_temp.espera('V3 reemplazado: su acta confirmada a tiempo se acepta',
  pg_temp.rpc(pg_temp.id('V3'), pg_temp.acta(pg_temp.id('A3'), pg_temp.id('m3'), 'alcaldia', 20, 100, now() - interval '1 hour')), 'guardada');
select pg_temp.espera('V6 (nuevo) ya no puede registrar esa acta → conflicto', pg_temp.rpc(pg_temp.id('V6'), pg_temp.acta(gen_random_uuid(), pg_temp.id('m3'), 'alcaldia', 20, 100)), 'conflicto');

-- V1 confirma después del reemplazo: se rechaza y su foto queda huérfana.
select pg_temp.espera('V1 reemplazado sube la foto de prefectura', pg_temp.subir(pg_temp.id('V1'), pg_temp.id('m1') || '/prefectura.jpg'), 'ok');
select pg_temp.espera('V1 reemplazado: confirmada después del reemplazo → fuera_de_vigencia',
  pg_temp.rpc(pg_temp.id('V1'), pg_temp.acta(pg_temp.id('A2'), pg_temp.id('m1'), 'prefectura', 10, 40, now() - interval '10 minutes')), 'fuera_de_vigencia');
select pg_temp.espera('V1 reemplazado no reemplaza fotos (no es vigente)', pg_temp.como(pg_temp.id('V1'),
  format($$with u as (update storage.objects set owner_id = %L where bucket_id = 'actas' and name = %L returning 1)
           select count(*)::text from u$$, pg_temp.id('V1'), pg_temp.id('m1') || '/prefectura.jpg')), '0');
select pg_temp.espera('V2 (vigente) reemplaza la foto huérfana', pg_temp.como(pg_temp.id('V2'),
  format($$with u as (update storage.objects set owner_id = %L where bucket_id = 'actas' and name = %L returning 1)
           select count(*)::text from u$$, pg_temp.id('V2'), pg_temp.id('m1') || '/prefectura.jpg')), '1');
select pg_temp.espera('V2 registra el acta de prefectura', pg_temp.rpc(pg_temp.id('V2'), pg_temp.acta(pg_temp.id('A2'), pg_temp.id('m1'), 'prefectura', 10, 40)), 'guardada');
select pg_temp.espera('V2 ya no reemplaza la foto con el acta registrada', pg_temp.como(pg_temp.id('V2'),
  format($$with u as (update storage.objects set metadata = '{"x":1}' where bucket_id = 'actas' and name = %L returning 1)
           select count(*)::text from u$$, pg_temp.id('m1') || '/prefectura.jpg')), '0');
select pg_temp.espera('el reintento de V1 ya ve el conflicto', pg_temp.rpc(pg_temp.id('V1'), pg_temp.acta(gen_random_uuid(), pg_temp.id('m1'), 'prefectura', 10, 40, now() - interval '1 hour')), 'conflicto');

-- ---------------------------------------------------------------------------
-- 6. Inmutabilidad (ADR-14)
-- ---------------------------------------------------------------------------
select pg_temp.espera('V2 no edita actas', pg_temp.como(pg_temp.id('V2'),
  format($$update public.actas set votos_nulos = 1 where id = %L$$, pg_temp.id('A2'))), '42501');
select pg_temp.espera('V2 no inserta actas directamente', pg_temp.como(pg_temp.id('V2'),
  format($$insert into public.actas (id, mesa_id, dignidad, veedor_id, votos_nulos, votos_blancos, total_sufragantes)
          values (gen_random_uuid(), %L, 'alcaldia', %L, 0, 0, 0)$$, pg_temp.id('m1'), pg_temp.id('V2'))), '42501');

-- ---------------------------------------------------------------------------
-- Resultado
-- ---------------------------------------------------------------------------
select count(*) filter (where ok) as aprobadas, count(*) filter (where not ok) as fallidas,
       coalesce(string_agg(caso || ' → ' || detalle, E'\n' order by n) filter (where not ok), '') as detalle_fallidas
  from resultados;

rollback;
