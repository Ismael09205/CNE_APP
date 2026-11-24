-- =============================================================================
-- Pruebas SQL de la Fase 1 (PROJECT_SPEC §4.13): CHECK, UNIQUE, triggers de rol,
-- reglas del acta e inmutabilidad. Todo corre en una transacción y termina en
-- ROLLBACK: no deja datos. Requiere el seed (supabase/seed) cargado.
-- Cada caso negativo debe fallar con el HINT / SQLSTATE esperado.
-- =============================================================================
begin;

create temporary table resultados (n serial, caso text, ok boolean, detalle text) on commit drop;

-- Ejecuta `sentencia` y verifica que falle con el hint o sqlstate esperado.
create function pg_temp.debe_fallar(caso text, sentencia text, esperado text) returns void
language plpgsql as $$
declare v_hint text; v_state text; v_msg text;
begin
  begin
    execute sentencia;
    set constraints all immediate;   -- fuerza las reglas diferidas del acta
    set constraints all deferred;
    insert into resultados (caso, ok, detalle) values (caso, false, 'no falló');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint, v_state = returned_sqlstate, v_msg = message_text;
    insert into resultados (caso, ok, detalle)
    values (caso, coalesce(v_hint, '') = esperado or v_state = esperado, coalesce(nullif(v_hint, ''), v_state) || ': ' || v_msg);
  end;
end $$;

create function pg_temp.debe_pasar(caso text, sentencia text) returns void
language plpgsql as $$
declare v_msg text;
begin
  begin
    execute sentencia;
    set constraints all immediate;
    set constraints all deferred;
    insert into resultados (caso, ok, detalle) values (caso, true, 'ok');
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into resultados (caso, ok, detalle) values (caso, false, v_msg);
  end;
end $$;

create function pg_temp.es(caso text, condicion boolean) returns void
language sql as $$ insert into resultados (caso, ok, detalle) values (caso, condicion, ''); $$;

-- ---------------------------------------------------------------------------
-- 1. Reglas puras (mismos casos que src/domain/__tests__)
-- ---------------------------------------------------------------------------
select pg_temp.es('cédula válida ' || c, private.cedula_valida(c))
  from unnest(array['1710034065', '1000000008', '0926687856', '1003123450', '0100000009', '2400000002']) c;
select pg_temp.es('cédula inválida ' || c, not private.cedula_valida(c))
  from unnest(array['123', '17100340650', '17100340a5', '', '0010034065', '2510034065', '3010034065',
                    '1760034065', '1790034065', '1710034064', '1710034066']) c;
select pg_temp.es('nombre válido ' || n, private.nombre_valido(n))
  from unnest(array['María José', 'Peñaherrera Ñúñez', 'Ana-María', 'De la Torre', 'Müller', 'Ñusta']) n;
select pg_temp.es('nombre inválido ' || coalesce(n, 'null'), not private.nombre_valido(n))
  from unnest(array['O''Brien', 'Juan2', 'Ana_', '-Ana', 'Ana-', 'A', repeat('a', 61), ' Ana', 'Ana  Luz', null]) n;
select pg_temp.es('nombre NFD rechazado (el dominio normaliza a NFC antes)', not private.nombre_valido(normalize('María', NFD)));

-- ---------------------------------------------------------------------------
-- 2. Personas de prueba
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'prov@test.ec'),
  ('00000000-0000-4000-8000-000000000002', 'crec@test.ec'),
  ('00000000-0000-4000-8000-000000000003', 'v1@test.ec'),
  ('00000000-0000-4000-8000-000000000004', 'v2@test.ec'),
  ('00000000-0000-4000-8000-000000000005', 'crec2@test.ec');

insert into public.perfiles (id, cedula, nombres, apellidos, telefono, correo, rol) values
  ('00000000-0000-4000-8000-000000000001', '1710034065', 'Ana', 'Provincial', '0991111111', 'prov@test.ec', 'coordinador_provincial'),
  ('00000000-0000-4000-8000-000000000002', '1000000008', 'Luis', 'Recinto', '0992222222', 'crec@test.ec', 'coordinador_recinto'),
  ('00000000-0000-4000-8000-000000000003', '0926687856', 'María José', 'Veedora', '0993333333', 'v1@test.ec', 'veedor'),
  ('00000000-0000-4000-8000-000000000004', '1003123450', 'Pedro', 'Veedor', '0994444444', 'v2@test.ec', 'veedor'),
  ('00000000-0000-4000-8000-000000000005', '0100000009', 'Rosa', 'Recinto', '0995555555', 'crec2@test.ec', 'coordinador_recinto');

select pg_temp.es('perfil nuevo con debe_cambiar_clave = true por defecto',
  (select debe_cambiar_clave and activo and not correo_verificado from public.perfiles where correo = 'v1@test.ec'));

select pg_temp.debe_fallar('perfil con cédula inválida',
  $$insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000a1', 'x1@test.ec');
    insert into public.perfiles (id, cedula, nombres, apellidos, telefono, correo, rol)
    values ('00000000-0000-4000-8000-0000000000a1', '1710034064', 'Ana', 'Pérez', '0991234567', 'x1@test.ec', 'veedor')$$,
  '23514');
select pg_temp.debe_fallar('perfil con teléfono inválido',
  $$insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000a2', 'x2@test.ec');
    insert into public.perfiles (id, cedula, nombres, apellidos, telefono, correo, rol)
    values ('00000000-0000-4000-8000-0000000000a2', '2400000002', 'Ana', 'Pérez', '0891234567', 'x2@test.ec', 'veedor')$$,
  '23514');
select pg_temp.debe_fallar('perfil con correo en mayúsculas',
  $$insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000a3', 'x3@test.ec');
    insert into public.perfiles (id, cedula, nombres, apellidos, telefono, correo, rol)
    values ('00000000-0000-4000-8000-0000000000a3', '2400000002', 'Ana', 'Pérez', '0991234567', 'X3@test.ec', 'veedor')$$,
  '23514');
select pg_temp.debe_fallar('perfil con cédula repetida (UNIQUE)',
  $$insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000a4', 'x4@test.ec');
    insert into public.perfiles (id, cedula, nombres, apellidos, telefono, correo, rol)
    values ('00000000-0000-4000-8000-0000000000a4', '1710034065', 'Ana', 'Pérez', '0991234567', 'x4@test.ec', 'veedor')$$,
  '23505');

-- ---------------------------------------------------------------------------
-- 3. Vigencias y triggers de rol
-- ---------------------------------------------------------------------------
create temporary table ctx on commit drop as
select (select id from public.recintos where codigo = '989') as r1,
       (select id from public.recintos where codigo = '1007') as r2,
       (select m.id from public.mesas m join public.recintos r on r.id = m.recinto_id where r.codigo = '989' and numero = 1 and sexo = 'F') as m1,
       (select m.id from public.mesas m join public.recintos r on r.id = m.recinto_id where r.codigo = '989' and numero = 1 and sexo = 'M') as m2;

insert into public.coordinaciones_provinciales (coordinador_id, provincia_id)
values ('00000000-0000-4000-8000-000000000001', 10);
insert into public.coordinaciones_recinto (recinto_id, coordinador_id, asignado_por)
select r1, '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001' from ctx;
insert into public.veedores_recinto (veedor_id, recinto_id, registrado_por)
select v, r1, '00000000-0000-4000-8000-000000000002' from ctx,
  unnest(array['00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000004']::uuid[]) v;
insert into public.asignaciones_mesa (mesa_id, veedor_id, asignado_por)
select m1, '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002' from ctx;

select pg_temp.debe_fallar('coordinador provincial con rol de veedor',
  $$insert into public.coordinaciones_provinciales (coordinador_id, provincia_id) values ('00000000-0000-4000-8000-000000000003', 10)$$,
  'rol_incorrecto');
select pg_temp.debe_fallar('dos coordinadores vigentes en el mismo recinto (ADR-08)',
  $$insert into public.coordinaciones_recinto (recinto_id, coordinador_id, asignado_por)
    select r1, '00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000001' from ctx$$,
  '23505');
select pg_temp.debe_fallar('un coordinador vigente en dos recintos',
  $$insert into public.coordinaciones_recinto (recinto_id, coordinador_id, asignado_por)
    select r2, '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001' from ctx$$,
  '23505');
select pg_temp.debe_fallar('veedor de recinto con rol de coordinador',
  $$insert into public.veedores_recinto (veedor_id, recinto_id, registrado_por)
    select '00000000-0000-4000-8000-000000000005', r2, '00000000-0000-4000-8000-000000000001' from ctx$$,
  'rol_incorrecto');
select pg_temp.debe_fallar('veedor vigente en dos recintos',
  $$insert into public.veedores_recinto (veedor_id, recinto_id, registrado_por)
    select '00000000-0000-4000-8000-000000000003', r2, '00000000-0000-4000-8000-000000000001' from ctx$$,
  '23505');
select pg_temp.debe_fallar('dos veedores vigentes en la misma mesa (ADR-09)',
  $$insert into public.asignaciones_mesa (mesa_id, veedor_id, asignado_por)
    select m1, '00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000002' from ctx$$,
  '23505');
select pg_temp.debe_fallar('un veedor vigente en dos mesas (S-04)',
  $$insert into public.asignaciones_mesa (mesa_id, veedor_id, asignado_por)
    select m2, '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002' from ctx$$,
  '23505');
select pg_temp.debe_fallar('asignar mesa a un coordinador',
  $$insert into public.asignaciones_mesa (mesa_id, veedor_id, asignado_por)
    select m2, '00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000002' from ctx$$,
  'rol_incorrecto');
select pg_temp.debe_fallar('cambiar el rol de alguien con asignación vigente',
  $$update public.perfiles set rol = 'coordinador_recinto' where id = '00000000-0000-4000-8000-000000000003'$$,
  'rol_con_vigencias');
select pg_temp.debe_pasar('reemplazo: cerrar la asignación vigente y abrir otra',
  $$update public.asignaciones_mesa set hasta = now() where mesa_id = (select m1 from ctx) and hasta is null;
    insert into public.asignaciones_mesa (mesa_id, veedor_id, asignado_por)
    select m1, '00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000002' from ctx$$);
select pg_temp.es('historial: la mesa tiene 2 asignaciones y 1 vigente',
  (select count(*) = 2 and count(*) filter (where hasta is null) = 1 from public.asignaciones_mesa where mesa_id = (select m1 from ctx)));

-- ---------------------------------------------------------------------------
-- 4. Reglas del acta (diferidas al COMMIT) — mismas que validarResultadosActa
-- ---------------------------------------------------------------------------
-- Inserta un acta de alcaldía (5 listas) con votos por lista = $2, nulos, blancos, total.
create function pg_temp.sql_acta(acta uuid, dignidad text, votos int, nulos int, blancos int, total int,
                                 excluir_lista text default null, lista_extra_de text default null) returns text
language sql as $$
  select format($f$
    insert into public.actas (id, mesa_id, dignidad, veedor_id, votos_nulos, votos_blancos, total_sufragantes,
                              confirmada_en, foto_path, lat, lng, precision_m, ubicacion_simulada, capturada_en)
    select %1$L, m2, %2$L, '00000000-0000-4000-8000-000000000004', %4$s, %5$s, %6$s,
           now(), m2::text || '/' || %2$L || '.jpg', 0.3, -78.26, 6, false, now() from ctx;
    insert into public.votos_acta (acta_id, candidatura_id, votos)
    select %1$L, id, %3$s from public.candidaturas
     where dignidad = coalesce(%8$L, %2$L) and lista is distinct from %7$L;$f$,
    acta, dignidad, votos, nulos, blancos, total, excluir_lista, lista_extra_de);
$$;

-- m2 queda sin veedor vigente; el veedor 4 hoy está en m1. La pertenencia del
-- autor a la mesa la controlan RLS/RPC (Fase 2); aquí solo las reglas del acta.
select pg_temp.debe_fallar('acta: la suma no cuadra',
  pg_temp.sql_acta('00000000-0000-4000-9000-000000000001', 'alcaldia', 20, 2, 3, 106), 'suma_no_cuadra');
select pg_temp.debe_fallar('acta: falta una lista',
  pg_temp.sql_acta('00000000-0000-4000-9000-000000000002', 'alcaldia', 20, 2, 3, 85, '17'), 'candidatura_faltante');
select pg_temp.debe_fallar('acta de prefectura con listas de alcaldía',
  pg_temp.sql_acta('00000000-0000-4000-9000-000000000003', 'prefectura', 20, 2, 3, 105, null, 'alcaldia'), 'candidatura_desconocida');
select pg_temp.debe_fallar('acta: votos de una lista mayores que el total',
  pg_temp.sql_acta('00000000-0000-4000-9000-000000000004', 'prefectura', 5, 0, 0, 4), 'votos_mayor_que_total');
select pg_temp.debe_fallar('acta: votos negativos',
  pg_temp.sql_acta('00000000-0000-4000-9000-000000000005', 'alcaldia', -1, 2, 8, 5), '23514');
select pg_temp.debe_fallar('acta enviada sin foto (RF-13)',
  $$insert into public.actas (id, mesa_id, dignidad, veedor_id, votos_nulos, votos_blancos, total_sufragantes, confirmada_en)
    select '00000000-0000-4000-9000-000000000006', m2, 'alcaldia', '00000000-0000-4000-8000-000000000004', 0, 0, 0, now() from ctx$$,
  '23514');
select pg_temp.debe_fallar('acta con ruta de foto distinta de {mesa}/{dignidad}.jpg',
  replace(pg_temp.sql_acta('00000000-0000-4000-9000-000000000007', 'alcaldia', 20, 2, 3, 105), '.jpg', '.png'), '23514');

-- Máximo de electores de la mesa (solo si existe el dato).
update public.mesas set numero_electores = 100 where id = (select m2 from ctx);
select pg_temp.debe_fallar('acta: total mayor que los electores de la mesa',
  pg_temp.sql_acta('00000000-0000-4000-9000-000000000008', 'alcaldia', 20, 2, 3, 105), 'total_mayor_que_maximo');
update public.mesas set numero_electores = null where id = (select m2 from ctx);

select pg_temp.debe_pasar('acta de alcaldía válida (5 listas × 20 + 2 + 3 = 105)',
  pg_temp.sql_acta('00000000-0000-4000-9000-0000000000a1', 'alcaldia', 20, 2, 3, 105));
select pg_temp.debe_pasar('acta de prefectura válida en la misma mesa (4 listas × 20 + 5 = 85)',
  pg_temp.sql_acta('00000000-0000-4000-9000-0000000000a2', 'prefectura', 20, 2, 3, 85));
select pg_temp.debe_fallar('segunda acta de alcaldía en la misma mesa (UNIQUE mesa + dignidad)',
  pg_temp.sql_acta('00000000-0000-4000-9000-0000000000a3', 'alcaldia', 20, 2, 3, 105), '23505');

-- ---------------------------------------------------------------------------
-- 5. Inmutabilidad (ADR-14), también para el dueño de la base
-- ---------------------------------------------------------------------------
select pg_temp.debe_fallar('UPDATE de un acta enviada',
  $$update public.actas set votos_nulos = 3 where id = '00000000-0000-4000-9000-0000000000a1'$$, 'acta_inmutable');
select pg_temp.debe_fallar('DELETE de un acta enviada',
  $$delete from public.actas where id = '00000000-0000-4000-9000-0000000000a1'$$, 'acta_inmutable');
select pg_temp.debe_fallar('UPDATE de los votos de un acta enviada',
  $$update public.votos_acta set votos = 21 where acta_id = '00000000-0000-4000-9000-0000000000a1'$$, 'acta_inmutable');
select pg_temp.debe_fallar('DELETE de los votos de un acta enviada',
  $$delete from public.votos_acta where acta_id = '00000000-0000-4000-9000-0000000000a1'$$, 'acta_inmutable');
select pg_temp.debe_fallar('agregar votos de una lista de otra dignidad a un acta enviada',
  $$insert into public.votos_acta (acta_id, candidatura_id, votos)
    select '00000000-0000-4000-9000-0000000000a2', id, 0 from public.candidaturas where dignidad = 'alcaldia' and lista = '17'$$,
  'candidatura_desconocida');
select pg_temp.debe_fallar('TRUNCATE de actas',
  $$truncate public.votos_acta, public.actas$$, 'acta_inmutable');
select pg_temp.es('el acta sigue intacta', (select votos_nulos = 2 from public.actas where id = '00000000-0000-4000-9000-0000000000a1'));

-- ---------------------------------------------------------------------------
-- Resultado
-- ---------------------------------------------------------------------------
select count(*) filter (where ok) as aprobadas, count(*) filter (where not ok) as fallidas,
       coalesce(string_agg(caso || ' → ' || detalle, E'\n' order by n) filter (where not ok), '') as detalle_fallidas
  from resultados;

rollback;
