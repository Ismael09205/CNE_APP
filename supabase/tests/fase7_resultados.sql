-- =============================================================================
-- Pruebas de la Fase 7 (seguimiento, RF-17, ADR-17, ADR-16): las funciones de conteo
-- respetan el alcance de cada rol y solo cuentan actas enviadas. Corre en una transacción
-- y termina en ROLLBACK. Los conteos se comparan contra una línea base tomada antes de
-- insertar, para no depender de actas reales que ya existan.
--
-- P1 provincial (Imbabura) · C1 coordinador de r1 · C2 coordinador de r2 · V1 veedor de r1
-- r1 = 989 · r2 = 1007 · m1 = 989-1F
-- =============================================================================
begin;

create temporary table resultados (n serial, caso text, ok boolean, detalle text) on commit drop;
create temporary table ctx (k text primary key, v uuid) on commit drop;
create temporary table base (k text primary key, n bigint) on commit drop;

create function pg_temp.es(caso text, condicion boolean, detalle text default '') returns void
language sql as $$ insert into resultados (caso, ok, detalle) values (caso, coalesce(condicion, false), detalle); $$;
create function pg_temp.id(clave text) returns uuid language sql stable as $$ select v from ctx where k = clave $$;

-- Valor escalar de `consulta` ejecutada como `uid` (null = anon).
create function pg_temp.valor(uid uuid, consulta text) returns bigint
language plpgsql as $$
declare n bigint;
begin
  perform set_config('request.jwt.claims',
    coalesce(json_build_object('sub', uid, 'role', 'authenticated')::text, '{"role":"anon"}'), true);
  execute case when uid is null then 'set local role anon' else 'set local role authenticated' end;
  execute consulta into n;
  execute 'reset role';
  return n;
exception when others then
  execute 'reset role';
  raise;
end $$;

create function pg_temp.intenta(caso text, uid uuid, sentencia text, esperado text) returns void
language plpgsql as $$
declare v_state text; v_msg text;
begin
  begin
    perform pg_temp.valor(uid, 'select count(*) from (' || sentencia || ') q');
    insert into resultados (caso, ok, detalle) values (caso, esperado = 'ok', 'se ejecutó');
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    insert into resultados (caso, ok, detalle) values (caso, v_state = esperado, v_state || ': ' || v_msg);
  end;
end $$;

-- Consultas que se repiten (como P1, C1, C2…).
create function pg_temp.q_actas(dignidad text) returns text language sql immutable as $$
  select format($f$select actas_%s::bigint from public.avance_por_recinto() where codigo = '989'$f$, dignidad) $$;
create function pg_temp.q_votos_lista(recinto uuid) returns text language sql immutable as $$
  select format($f$select coalesce(min(votos), -1) from public.totales_por_candidato('alcaldia', %L)$f$, recinto) $$;

-- ---------------------------------------------------------------------------
-- Datos
-- ---------------------------------------------------------------------------
insert into ctx values
  ('P1', '00000000-0000-4000-8000-000000000701'), ('C1', '00000000-0000-4000-8000-000000000711'),
  ('C2', '00000000-0000-4000-8000-000000000712'), ('V1', '00000000-0000-4000-8000-000000000721'),
  ('A1', '00000000-0000-4000-9000-000000000701'), ('A2', '00000000-0000-4000-9000-000000000702');
insert into ctx
select 'r1', id from public.recintos where codigo = '989' union all
select 'r2', id from public.recintos where codigo = '1007' union all
select 'm1', m.id from public.mesas m join public.recintos r on r.id = m.recinto_id where r.codigo = '989' and m.numero = 1 and m.sexo = 'F';

insert into auth.users (id, email) select v, lower(k) || '@f7.test' from ctx where k ~ '^[PCV][0-9]$';
insert into public.perfiles (id, cedula, nombres, apellidos, telefono, correo, rol, activo, debe_cambiar_clave)
select pg_temp.id(k), cedula, 'Prueba', 'Persona', '0990000000', lower(k) || '@f7.test', rol, true, false
  from (values
    ('P1', '1001000015', 'coordinador_provincial'),
    ('C1', '1001000023', 'coordinador_recinto'),
    ('C2', '1001000031', 'coordinador_recinto'),
    ('V1', '1001000072', 'veedor')
  ) as t(k, cedula, rol);
insert into public.coordinaciones_provinciales (coordinador_id, provincia_id) values (pg_temp.id('P1'), 10);
-- Si el recinto ya tiene coordinador real se cierra su vigencia solo dentro de esta prueba (ROLLBACK).
update public.coordinaciones_recinto set hasta = now() - interval '1 second'
 where hasta is null and recinto_id in (pg_temp.id('r1'), pg_temp.id('r2'));
insert into public.coordinaciones_recinto (recinto_id, coordinador_id, asignado_por) values
  (pg_temp.id('r1'), pg_temp.id('C1'), pg_temp.id('P1')), (pg_temp.id('r2'), pg_temp.id('C2'), pg_temp.id('P1'));

-- Línea base (antes de las actas de prueba).
insert into base values
  ('alc', pg_temp.valor(pg_temp.id('P1'), pg_temp.q_actas('alcaldia'))),
  ('pre', pg_temp.valor(pg_temp.id('P1'), pg_temp.q_actas('prefectura'))),
  ('rev', pg_temp.valor(pg_temp.id('P1'), $$select actas_en_revision::bigint from public.avance_por_recinto() where codigo = '989'$$)),
  ('votos', pg_temp.valor(pg_temp.id('P1'), pg_temp.q_votos_lista(pg_temp.id('r1')))),
  ('resumen', pg_temp.valor(pg_temp.id('P1'), format($$select actas::bigint from public.resumen_votos('alcaldia', %L)$$, pg_temp.id('r1')))),
  ('blancos', pg_temp.valor(pg_temp.id('P1'), format($$select blancos::bigint from public.resumen_votos('alcaldia', %L)$$, pg_temp.id('r1'))));

-- Dos actas en m1: alcaldía (10 votos por lista) y prefectura con GPS impreciso (revisión).
insert into public.actas (id, mesa_id, dignidad, veedor_id, votos_nulos, votos_blancos, total_sufragantes, estado,
                          confirmada_en, foto_path, lat, lng, precision_m, ubicacion_simulada, capturada_en)
values
  (pg_temp.id('A1'), pg_temp.id('m1'), 'alcaldia', pg_temp.id('V1'), 1, 2,
   (select count(*) * 10 + 3 from public.candidaturas where dignidad = 'alcaldia'), 'enviada',
   now(), pg_temp.id('m1') || '/alcaldia.jpg', 0.3, -78.26, 6, false, now()),
  (pg_temp.id('A2'), pg_temp.id('m1'), 'prefectura', pg_temp.id('V1'), 0, 0,
   (select count(*) * 5 from public.candidaturas where dignidad = 'prefectura'), 'enviada',
   now(), pg_temp.id('m1') || '/prefectura.jpg', 0.3, -78.26, 80, false, now());
insert into public.votos_acta (acta_id, candidatura_id, votos)
select pg_temp.id('A1'), id, 10 from public.candidaturas where dignidad = 'alcaldia' union all
select pg_temp.id('A2'), id, 5 from public.candidaturas where dignidad = 'prefectura';
set constraints all immediate;
set constraints all deferred;

-- ---------------------------------------------------------------------------
-- Provincial: ve todo su alcance
-- ---------------------------------------------------------------------------
select pg_temp.es('P1: el acta de alcaldía suma 1 en r1',
  pg_temp.valor(pg_temp.id('P1'), pg_temp.q_actas('alcaldia')) = (select n from base where k = 'alc') + 1);
select pg_temp.es('P1: el acta de prefectura suma 1 en r1',
  pg_temp.valor(pg_temp.id('P1'), pg_temp.q_actas('prefectura')) = (select n from base where k = 'pre') + 1);
select pg_temp.es('P1: GPS de 80 m cuenta como acta en revisión (F6-4)',
  pg_temp.valor(pg_temp.id('P1'), $$select actas_en_revision::bigint from public.avance_por_recinto() where codigo = '989'$$)
    = (select n from base where k = 'rev') + 1);
select pg_temp.es('P1: actas esperadas = 2 por mesa',
  pg_temp.valor(pg_temp.id('P1'), $$select (actas_esperadas = mesas * 2)::int::bigint from public.avance_por_recinto() where codigo = '989'$$) = 1);
select pg_temp.es('P1: cada lista de alcaldía suma 10 votos en r1',
  pg_temp.valor(pg_temp.id('P1'), pg_temp.q_votos_lista(pg_temp.id('r1'))) = (select n from base where k = 'votos') + 10);
select pg_temp.es('P1: el total general también incluye los votos',
  pg_temp.valor(pg_temp.id('P1'), $$select coalesce(min(votos), -1) from public.totales_por_candidato('alcaldia')$$) >= 10);
select pg_temp.es('P1: resumen de alcaldía en r1 cuenta 1 acta más',
  pg_temp.valor(pg_temp.id('P1'), format($$select actas::bigint from public.resumen_votos('alcaldia', %L)$$, pg_temp.id('r1')))
    = (select n from base where k = 'resumen') + 1);
select pg_temp.es('P1: resumen suma los 2 votos en blanco',
  pg_temp.valor(pg_temp.id('P1'), format($$select blancos::bigint from public.resumen_votos('alcaldia', %L)$$, pg_temp.id('r1')))
    = (select n from base where k = 'blancos') + 2);
select pg_temp.es('P1: una dignidad inexistente no devuelve listas',
  pg_temp.valor(pg_temp.id('P1'), $$select count(*) from public.totales_por_candidato('concejales')$$) = 0);

-- ---------------------------------------------------------------------------
-- Coordinadores de recinto: solo su recinto (ADR-16)
-- ---------------------------------------------------------------------------
select pg_temp.es('C1: en el avance solo aparece su recinto',
  pg_temp.valor(pg_temp.id('C1'), $$select count(*) from public.avance_por_recinto()$$) = 1
  and pg_temp.valor(pg_temp.id('C1'), pg_temp.q_actas('alcaldia')) = (select n from base where k = 'alc') + 1);
select pg_temp.es('C1: ve los votos de su recinto',
  pg_temp.valor(pg_temp.id('C1'), pg_temp.q_votos_lista(pg_temp.id('r1'))) = (select n from base where k = 'votos') + 10);
select pg_temp.es('C2: no ve el recinto r1 en el avance',
  pg_temp.valor(pg_temp.id('C2'), $$select count(*) from public.avance_por_recinto() where codigo = '989'$$) = 0);
select pg_temp.es('C2: los votos de r1 le salen en cero',
  pg_temp.valor(pg_temp.id('C2'), format($$select coalesce(max(votos), 0) from public.totales_por_candidato('alcaldia', %L)$$, pg_temp.id('r1'))) = 0);
select pg_temp.es('C2: el resumen de r1 le sale vacío',
  pg_temp.valor(pg_temp.id('C2'), format($$select actas::bigint from public.resumen_votos('alcaldia', %L)$$, pg_temp.id('r1'))) = 0);

-- ---------------------------------------------------------------------------
-- Sin sesión y Realtime
-- ---------------------------------------------------------------------------
select pg_temp.intenta('anon no llama avance_por_recinto', null, 'select * from public.avance_por_recinto()', '42501');
select pg_temp.intenta('anon no llama totales_por_candidato', null, $$select * from public.totales_por_candidato('alcaldia')$$, '42501');
select pg_temp.intenta('anon no llama resumen_votos', null, $$select * from public.resumen_votos('alcaldia')$$, '42501');
select pg_temp.es('actas está publicada en Realtime',
  exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'actas'));

select count(*) filter (where ok) as aprobadas, count(*) filter (where not ok) as fallidas,
       coalesce(string_agg(caso || ' → ' || detalle, E'\n' order by n) filter (where not ok), '') as detalle_fallidas
  from resultados;

rollback;
