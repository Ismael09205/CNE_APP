-- =============================================================================
-- Pruebas de la Fase 5 (gestión territorial): alta de recinto con GPS, mesas por
-- rango, asignar coordinador, asignar y reemplazar veedor, con cada rol.
-- Corre en una transacción y termina en ROLLBACK. Requiere el seed cargado.
--
-- r1 = 989 · r2 = 1007 · r3 = 1219 · r4 = 1224
-- P1 provincial · C1 coord r1 · C2 coord r2 · C3 coord sin recinto · C4 coord sin recinto · CT coord con clave temporal
-- V1 veedor r1 en m1 · V2 y V6 veedores r1 libres · V3 veedor r2 · V4 veedor r1 inactivo
-- m1 = 989-1F (V1) · m2 = 989-1M · m4 = 989-2F
-- =============================================================================
begin;

create temporary table resultados (n serial, caso text, ok boolean, detalle text) on commit drop;
create temporary table ctx (k text primary key, v uuid) on commit drop;

create function pg_temp.es(caso text, condicion boolean) returns void
language sql as $$ insert into resultados (caso, ok, detalle) values (caso, coalesce(condicion, false), ''); $$;
create function pg_temp.id(clave text) returns uuid language sql stable as $$ select v from ctx where k = clave $$;

create function pg_temp.ver(caso text, uid uuid, consulta text, esperado bigint) returns void
language plpgsql as $$
declare n bigint;
begin
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    execute 'select count(*) from (' || consulta || ') q' into n;
    execute 'reset role';
    insert into resultados (caso, ok, detalle) values (caso, n = esperado, format('obtenido %s, esperado %s', n, esperado));
  exception when others then
    insert into resultados (caso, ok, detalle) values (caso, false, 'error: ' || sqlerrm);
  end;
end $$;

create function pg_temp.intenta(caso text, uid uuid, sentencia text, esperado text) returns void
language plpgsql as $$
declare v_state text; v_hint text; v_msg text;
begin
  begin
    perform set_config('request.jwt.claims',
      coalesce(json_build_object('sub', uid, 'role', 'authenticated')::text, '{"role":"anon"}'), true);
    execute case when uid is null then 'set local role anon' else 'set local role authenticated' end;
    execute sentencia;
    execute 'reset role';
    insert into resultados (caso, ok, detalle) values (caso, 'ok' = any (string_to_array(esperado, '|')), 'se ejecutó');
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
    insert into resultados (caso, ok, detalle)
    values (caso, v_state = any (string_to_array(esperado, '|')) or coalesce(v_hint, '') = any (string_to_array(esperado, '|')),
            coalesce(nullif(v_hint, ''), v_state) || ': ' || v_msg);
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Datos
-- ---------------------------------------------------------------------------
insert into ctx values
  ('P1', '00000000-0000-4000-8000-000000000501'), ('C1', '00000000-0000-4000-8000-000000000511'),
  ('C2', '00000000-0000-4000-8000-000000000512'), ('C3', '00000000-0000-4000-8000-000000000513'),
  ('C4', '00000000-0000-4000-8000-000000000514'), ('CT', '00000000-0000-4000-8000-000000000515'),
  ('V1', '00000000-0000-4000-8000-000000000521'), ('V2', '00000000-0000-4000-8000-000000000522'),
  ('V3', '00000000-0000-4000-8000-000000000523'), ('V4', '00000000-0000-4000-8000-000000000524'),
  ('V6', '00000000-0000-4000-8000-000000000526');
insert into ctx
select 'r1', id from public.recintos where codigo = '989' union all
select 'r2', id from public.recintos where codigo = '1007' union all
select 'r3', id from public.recintos where codigo = '1219' union all
select 'r4', id from public.recintos where codigo = '1224' union all
select 'm1', m.id from public.mesas m join public.recintos r on r.id = m.recinto_id where r.codigo = '989' and m.numero = 1 and m.sexo = 'F' union all
select 'm2', m.id from public.mesas m join public.recintos r on r.id = m.recinto_id where r.codigo = '989' and m.numero = 1 and m.sexo = 'M' union all
select 'm4', m.id from public.mesas m join public.recintos r on r.id = m.recinto_id where r.codigo = '989' and m.numero = 2 and m.sexo = 'F';

insert into auth.users (id, email) select v, lower(k) || '@f5.test' from ctx where k ~ '^[PCV][0-9T]$';
insert into public.perfiles (id, cedula, nombres, apellidos, telefono, correo, rol, activo, debe_cambiar_clave)
select pg_temp.id(k), cedula, 'Prueba', 'Persona', '0990000000', lower(k) || '@f5.test', rol, activo, temporal
  from (values
    ('P1', '1001000015', 'coordinador_provincial', true, false),
    ('C1', '1001000023', 'coordinador_recinto', true, false),
    ('C2', '1001000031', 'coordinador_recinto', true, false),
    ('C3', '1001000049', 'coordinador_recinto', true, false),
    ('C4', '1001000056', 'coordinador_recinto', true, false),
    ('CT', '1001000064', 'coordinador_recinto', true, true),
    ('V1', '1001000072', 'veedor', true, false),
    ('V2', '1001000080', 'veedor', true, false),
    ('V3', '1001000098', 'veedor', true, false),
    ('V4', '1001000106', 'veedor', false, false),
    ('V6', '1001000114', 'veedor', true, false)
  ) as t(k, cedula, rol, activo, temporal);
insert into public.coordinaciones_provinciales (coordinador_id, provincia_id) values (pg_temp.id('P1'), 10);
insert into public.coordinaciones_recinto (recinto_id, coordinador_id, asignado_por) values
  (pg_temp.id('r1'), pg_temp.id('C1'), pg_temp.id('P1')), (pg_temp.id('r2'), pg_temp.id('C2'), pg_temp.id('P1')),
  (pg_temp.id('r4'), pg_temp.id('CT'), pg_temp.id('P1'));
insert into public.veedores_recinto (veedor_id, recinto_id, registrado_por)
select pg_temp.id(v), pg_temp.id(r), pg_temp.id('P1')
  from (values ('V1', 'r1'), ('V2', 'r1'), ('V4', 'r1'), ('V6', 'r1'), ('V3', 'r2')) t(v, r);
insert into public.asignaciones_mesa (mesa_id, veedor_id, asignado_por) values (pg_temp.id('m1'), pg_temp.id('V1'), pg_temp.id('C1'));

-- ---------------------------------------------------------------------------
-- F5: alta de recinto con GPS (D-30, D-31)
-- ---------------------------------------------------------------------------
select pg_temp.intenta('P1 crea un recinto con GPS de 12 m', pg_temp.id('P1'),
  format($$insert into public.recintos (parroquia_id, codigo, nombre, codigo_zona, lat, lng, precision_m, creado_por)
          values (5910, '990001', 'Recinto nuevo', 0, 0.3, -78.26, 12, %L)$$, pg_temp.id('P1')), 'ok');
select pg_temp.intenta('…y con RETURNING, como la app (la fila nueva es visible)', pg_temp.id('P1'),
  format($$insert into public.recintos (parroquia_id, codigo, nombre, codigo_zona, lat, lng, precision_m, creado_por)
          values (5910, '990004', 'Recinto nuevo', 0, 0.3, -78.26, 12, %L) returning id$$, pg_temp.id('P1')), 'ok');
select pg_temp.intenta('…sin precisión del GPS se rechaza (RLS)', pg_temp.id('P1'),
  format($$insert into public.recintos (parroquia_id, codigo, nombre, codigo_zona, lat, lng, creado_por)
          values (5910, '990002', 'Recinto nuevo', 0, 0.3, -78.26, %L)$$, pg_temp.id('P1')), '42501');
select pg_temp.intenta('…con precisión peor que 50 m se rechaza (CHECK)', pg_temp.id('P1'),
  format($$insert into public.recintos (parroquia_id, codigo, nombre, codigo_zona, lat, lng, precision_m, creado_por)
          values (5910, '990003', 'Recinto nuevo', 0, 0.3, -78.26, 80, %L)$$, pg_temp.id('P1')), '23514');
select pg_temp.intenta('…código repetido se rechaza', pg_temp.id('P1'),
  format($$insert into public.recintos (parroquia_id, codigo, nombre, codigo_zona, lat, lng, precision_m, creado_por)
          values (5910, '989', 'Duplicado', 0, 0.3, -78.26, 10, %L)$$, pg_temp.id('P1')), '23505');

-- ---------------------------------------------------------------------------
-- F5: mesas por rango (D-32)
-- ---------------------------------------------------------------------------
select pg_temp.intenta('P1 agrega las juntas 30–32 F a r1', pg_temp.id('P1'),
  format($$select public.agregar_mesas(%L, 'F', 30, 32)$$, pg_temp.id('r1')), 'ok');
select pg_temp.es('…se crearon 3 mesas', (select count(*) = 3 from public.mesas where recinto_id = pg_temp.id('r1') and sexo = 'F' and numero between 30 and 32));
select pg_temp.intenta('…un rango que se cruza se rechaza', pg_temp.id('P1'),
  format($$select public.agregar_mesas(%L, 'F', 32, 34)$$, pg_temp.id('r1')), 'mesas_existentes');
select pg_temp.es('…y no crea ninguna del rango', (select count(*) = 0 from public.mesas where recinto_id = pg_temp.id('r1') and sexo = 'F' and numero in (33, 34)));
select pg_temp.intenta('…rango invertido', pg_temp.id('P1'), format($$select public.agregar_mesas(%L, 'M', 5, 3)$$, pg_temp.id('r1')), 'rango_invalido');
select pg_temp.intenta('…rango de más de 60', pg_temp.id('P1'), format($$select public.agregar_mesas(%L, 'M', 40, 120)$$, pg_temp.id('r1')), 'rango_invalido');
select pg_temp.intenta('…sexo no válido', pg_temp.id('P1'), format($$select public.agregar_mesas(%L, 'X', 40, 41)$$, pg_temp.id('r1')), 'rango_invalido');
select pg_temp.intenta('C1 no agrega mesas', pg_temp.id('C1'), format($$select public.agregar_mesas(%L, 'M', 40, 41)$$, pg_temp.id('r1')), 'sin_permiso');
select pg_temp.intenta('anon no ejecuta las RPC', null, format($$select public.agregar_mesas(%L, 'M', 40, 41)$$, pg_temp.id('r1')), '42501');

-- ---------------------------------------------------------------------------
-- F6: asignar coordinador (ADR-08, D-06, D-34)
-- ---------------------------------------------------------------------------
select pg_temp.intenta('P1 asigna C3 a r3 (sin coordinador)', pg_temp.id('P1'),
  format($$select public.asignar_coordinador(%L, %L)$$, pg_temp.id('r3'), pg_temp.id('C3')), 'ok');
select pg_temp.intenta('…C3 no puede quedar en dos recintos', pg_temp.id('P1'),
  format($$select public.asignar_coordinador(%L, %L)$$, pg_temp.id('r2'), pg_temp.id('C3')), 'coordinador_con_recinto');
select pg_temp.intenta('…repetir la misma asignación', pg_temp.id('P1'),
  format($$select public.asignar_coordinador(%L, %L)$$, pg_temp.id('r3'), pg_temp.id('C3')), 'ya_asignado');
select pg_temp.intenta('…un veedor no puede ser coordinador', pg_temp.id('P1'),
  format($$select public.asignar_coordinador(%L, %L)$$, pg_temp.id('r3'), pg_temp.id('V2')), 'coordinador_no_valido');
select pg_temp.intenta('C1 no asigna coordinadores', pg_temp.id('C1'),
  format($$select public.asignar_coordinador(%L, %L)$$, pg_temp.id('r3'), pg_temp.id('C4')), 'sin_permiso');
select pg_temp.intenta('nadie escribe coordinaciones directamente', pg_temp.id('P1'),
  format($$update public.coordinaciones_recinto set hasta = now() where recinto_id = %L$$, pg_temp.id('r2')), '42501');

-- ---------------------------------------------------------------------------
-- F7: asignar veedor (ADR-09, D-33)
-- ---------------------------------------------------------------------------
select pg_temp.intenta('C1 asigna V2 a m2 (sin veedor)', pg_temp.id('C1'),
  format($$select public.asignar_veedor(%L, %L)$$, pg_temp.id('m2'), pg_temp.id('V2')), 'ok');
select pg_temp.intenta('…V2 no puede tener dos mesas (S-04)', pg_temp.id('C1'),
  format($$select public.asignar_veedor(%L, %L)$$, pg_temp.id('m4'), pg_temp.id('V2')), 'veedor_con_otra_mesa');
select pg_temp.intenta('…un veedor de otro recinto no (D-33)', pg_temp.id('C1'),
  format($$select public.asignar_veedor(%L, %L)$$, pg_temp.id('m4'), pg_temp.id('V3')), 'veedor_de_otro_recinto');
select pg_temp.intenta('…un veedor inactivo no', pg_temp.id('C1'),
  format($$select public.asignar_veedor(%L, %L)$$, pg_temp.id('m4'), pg_temp.id('V4')), 'veedor_no_valido');
select pg_temp.intenta('…una mesa que ya tiene veedor no (usar Reemplazar)', pg_temp.id('C1'),
  format($$select public.asignar_veedor(%L, %L)$$, pg_temp.id('m1'), pg_temp.id('V6')), 'mesa_con_veedor');
select pg_temp.intenta('C2 no asigna en un recinto ajeno', pg_temp.id('C2'),
  format($$select public.asignar_veedor(%L, %L)$$, pg_temp.id('m4'), pg_temp.id('V6')), 'no_es_coordinador_vigente');
select pg_temp.intenta('coordinador con clave temporal no asigna', pg_temp.id('CT'),
  format($$select public.asignar_veedor(%L, %L)$$, pg_temp.id('m4'), pg_temp.id('V6')), 'no_es_coordinador_vigente');
select pg_temp.intenta('el provincial no asigna veedores (RF-09)', pg_temp.id('P1'),
  format($$select public.asignar_veedor(%L, %L)$$, pg_temp.id('m4'), pg_temp.id('V6')), 'no_es_coordinador_vigente');
select pg_temp.intenta('un veedor no asigna', pg_temp.id('V1'),
  format($$select public.asignar_veedor(%L, %L)$$, pg_temp.id('m4'), pg_temp.id('V6')), 'no_es_coordinador_vigente');

-- ---------------------------------------------------------------------------
-- F8: reemplazo (ADR-10, S-04, S-06)
-- ---------------------------------------------------------------------------
select pg_temp.intenta('C1 reemplaza a V1 por V6 en m1', pg_temp.id('C1'),
  format($$select public.reemplazar_veedor(%L, %L, %L)$$, pg_temp.id('m1'), pg_temp.id('V1'), pg_temp.id('V6')), 'ok');
select pg_temp.es('…la asignación de V1 se cerró y V6 quedó vigente',
  (select bool_and(case when veedor_id = pg_temp.id('V1') then hasta is not null else hasta is null end) and count(*) = 2
     from public.asignaciones_mesa where mesa_id = pg_temp.id('m1')));
select pg_temp.ver('…V1 pierde el acceso a la mesa al instante', pg_temp.id('V1'), 'select 1 from public.mesas', 0);
select pg_temp.ver('…V6 ve la mesa', pg_temp.id('V6'), 'select 1 from public.mesas', 1);
select pg_temp.intenta('reemplazo con datos viejos (la app aún mostraba a V1) → concurrente', pg_temp.id('C1'),
  format($$select public.reemplazar_veedor(%L, %L, %L)$$, pg_temp.id('m1'), pg_temp.id('V1'), pg_temp.id('V1')), 'reemplazo_concurrente');
select pg_temp.intenta('reemplazar en una mesa sin veedor', pg_temp.id('C1'),
  format($$select public.reemplazar_veedor(%L, %L, %L)$$, pg_temp.id('m4'), pg_temp.id('V1'), pg_temp.id('V1')), 'mesa_sin_veedor');
select pg_temp.intenta('reemplazar con un veedor que ya tiene mesa', pg_temp.id('C1'),
  format($$select public.reemplazar_veedor(%L, %L, %L)$$, pg_temp.id('m1'), pg_temp.id('V6'), pg_temp.id('V2')), 'veedor_con_otra_mesa');
select pg_temp.intenta('reemplazar con un veedor de otro recinto (S-06)', pg_temp.id('C1'),
  format($$select public.reemplazar_veedor(%L, %L, %L)$$, pg_temp.id('m1'), pg_temp.id('V6'), pg_temp.id('V3')), 'veedor_de_otro_recinto');
select pg_temp.intenta('C2 no reemplaza en un recinto ajeno', pg_temp.id('C2'),
  format($$select public.reemplazar_veedor(%L, %L, %L)$$, pg_temp.id('m1'), pg_temp.id('V6'), pg_temp.id('V1')), 'no_es_coordinador_vigente');
select pg_temp.intenta('nadie escribe asignaciones directamente', pg_temp.id('C1'),
  format($$update public.asignaciones_mesa set hasta = now() where mesa_id = %L$$, pg_temp.id('m1')), '42501');

-- ---------------------------------------------------------------------------
-- F6: cambio de coordinador de un recinto
-- ---------------------------------------------------------------------------
select pg_temp.intenta('P1 cambia el coordinador de r1 a C4', pg_temp.id('P1'),
  format($$select public.asignar_coordinador(%L, %L)$$, pg_temp.id('r1'), pg_temp.id('C4')), 'ok');
select pg_temp.es('…la coordinación de C1 quedó en el historial',
  (select count(*) = 2 and count(*) filter (where hasta is null) = 1 from public.coordinaciones_recinto where recinto_id = pg_temp.id('r1')));
select pg_temp.ver('…C1 deja de ver el recinto', pg_temp.id('C1'), 'select 1 from public.recintos', 0);
select pg_temp.intenta('…y ya no puede reemplazar veedores', pg_temp.id('C1'),
  format($$select public.reemplazar_veedor(%L, %L, %L)$$, pg_temp.id('m1'), pg_temp.id('V6'), pg_temp.id('V1')), 'no_es_coordinador_vigente');
select pg_temp.ver('…C4 ve el recinto y sus mesas', pg_temp.id('C4'), 'select 1 from public.mesas', 22);

select count(*) filter (where ok) as aprobadas, count(*) filter (where not ok) as fallidas,
       coalesce(string_agg(caso || ' → ' || detalle, E'\n' order by n) filter (where not ok), '') as detalle_fallidas
  from resultados;

rollback;
