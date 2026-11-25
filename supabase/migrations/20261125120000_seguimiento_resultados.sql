-- Fase 7 — Seguimiento del escrutinio (RF-17, ADR-17, ADR-16).
-- El conteo se hace en SQL, sin descargar las actas al teléfono. Las funciones son
-- SECURITY INVOKER: la RLS de recintos, mesas, actas y votos decide qué cuenta cada
-- persona (provincial → su jurisdicción; coordinador de recinto → su recinto).
-- Solo cuentan las actas enviadas (las del servidor ya son definitivas, S-07).

-- Avance por recinto: mesas, actas esperadas (una por dignidad y mesa) y recibidas.
create function public.avance_por_recinto()
returns table (
  recinto_id uuid,
  codigo text,
  nombre text,
  parroquia text,
  lat double precision,
  lng double precision,
  sin_conectividad boolean,
  mesas integer,
  actas_esperadas integer,
  actas_alcaldia integer,
  actas_prefectura integer,
  actas_en_revision integer,
  ultima_recibida timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select r.id, r.codigo, r.nombre, pa.nombre, r.lat, r.lng, r.sin_conectividad,
         count(distinct m.id)::integer,
         (count(distinct m.id) * 2)::integer,
         (count(a.id) filter (where a.dignidad = 'alcaldia'))::integer,
         (count(a.id) filter (where a.dignidad = 'prefectura'))::integer,
         -- F6-4: ubicación imprecisa (> 50 m, mismo límite que la app) o simulada.
         (count(a.id) filter (where a.precision_m > 50 or a.ubicacion_simulada))::integer,
         max(a.recibida_en)
    from public.recintos r
    join public.parroquias pa on pa.id = r.parroquia_id
    left join public.mesas m on m.recinto_id = r.id
    left join public.actas a on a.mesa_id = m.id and a.estado = 'enviada'
   group by r.id, pa.nombre
   order by r.nombre;
$$;

-- Votos por candidatura de una dignidad, en total o de un recinto.
create function public.totales_por_candidato(p_dignidad text, p_recinto uuid default null)
returns table (
  candidatura_id uuid,
  lista text,
  organizacion_politica text,
  candidato text,
  binomio text,
  color text,
  votos bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select k.id, k.lista, k.organizacion_politica, k.candidato, k.binomio, k.color,
         coalesce(sum(t.votos), 0)::bigint
    from public.candidaturas k
    left join (
      select v.candidatura_id, v.votos
        from public.votos_acta v
        join public.actas a on a.id = v.acta_id and a.estado = 'enviada'
        join public.mesas m on m.id = a.mesa_id
       where p_recinto is null or m.recinto_id = p_recinto
    ) t on t.candidatura_id = k.id
   where k.dignidad = p_dignidad
   group by k.id
   order by 7 desc, k.lista;
$$;

-- Resumen de una dignidad: actas contadas, sufragantes, blancos y nulos.
create function public.resumen_votos(p_dignidad text, p_recinto uuid default null)
returns table (actas integer, sufragantes integer, blancos integer, nulos integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)::integer,
         coalesce(sum(a.total_sufragantes), 0)::integer,
         coalesce(sum(a.votos_blancos), 0)::integer,
         coalesce(sum(a.votos_nulos), 0)::integer
    from public.actas a
    join public.mesas m on m.id = a.mesa_id
   where a.estado = 'enviada' and a.dignidad = p_dignidad
     and (p_recinto is null or m.recinto_id = p_recinto);
$$;

revoke all on function public.avance_por_recinto() from public, anon;
revoke all on function public.totales_por_candidato(text, uuid) from public, anon;
revoke all on function public.resumen_votos(text, uuid) from public, anon;
grant execute on function public.avance_por_recinto() to authenticated;
grant execute on function public.totales_por_candidato(text, uuid) to authenticated;
grant execute on function public.resumen_votos(text, uuid) to authenticated;

-- Realtime (ADR-17): avisa cuando llega un acta. La RLS de `actas` filtra los eventos
-- por suscriptor (ADR-16); la app solo usa el aviso para volver a consultar.
alter publication supabase_realtime add table public.actas;
