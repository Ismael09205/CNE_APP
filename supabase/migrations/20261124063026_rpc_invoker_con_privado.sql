-- =============================================================================
-- Fase 5 · Advisor 0029 (authenticated_security_definer_function_executable).
-- Patrón recomendado: la RPC pública es SECURITY INVOKER y delega en una función
-- SECURITY DEFINER del esquema `private` (no expuesto por la Data API). Mismo
-- comportamiento y mismas verificaciones de quién llama (auth.uid()).
-- =============================================================================
alter function public.asignar_coordinador(uuid, uuid) set schema private;
alter function private.asignar_coordinador(uuid, uuid) rename to asignar_coordinador_impl;
alter function public.asignar_veedor(uuid, uuid) set schema private;
alter function private.asignar_veedor(uuid, uuid) rename to asignar_veedor_impl;
alter function public.reemplazar_veedor(uuid, uuid, uuid) set schema private;
alter function private.reemplazar_veedor(uuid, uuid, uuid) rename to reemplazar_veedor_impl;

create function public.asignar_coordinador(p_recinto uuid, p_coordinador uuid)
returns uuid language sql security invoker set search_path = ''
as $$ select private.asignar_coordinador_impl(p_recinto, p_coordinador); $$;

create function public.asignar_veedor(p_mesa uuid, p_veedor uuid)
returns uuid language sql security invoker set search_path = ''
as $$ select private.asignar_veedor_impl(p_mesa, p_veedor); $$;

create function public.reemplazar_veedor(p_mesa uuid, p_veedor_actual uuid, p_nuevo_veedor uuid)
returns uuid language sql security invoker set search_path = ''
as $$ select private.reemplazar_veedor_impl(p_mesa, p_veedor_actual, p_nuevo_veedor); $$;

revoke execute on function
  public.asignar_coordinador(uuid, uuid), public.asignar_veedor(uuid, uuid), public.reemplazar_veedor(uuid, uuid, uuid),
  private.asignar_coordinador_impl(uuid, uuid), private.asignar_veedor_impl(uuid, uuid), private.reemplazar_veedor_impl(uuid, uuid, uuid)
  from public, anon;
grant execute on function
  public.asignar_coordinador(uuid, uuid), public.asignar_veedor(uuid, uuid), public.reemplazar_veedor(uuid, uuid, uuid),
  private.asignar_coordinador_impl(uuid, uuid), private.asignar_veedor_impl(uuid, uuid), private.reemplazar_veedor_impl(uuid, uuid, uuid)
  to authenticated;
