-- service_role inserta perfiles directamente (script del primer provincial).
-- Los CHECK de perfiles llaman a estas funciones puras (sin acceso a datos).
grant execute on function private.cedula_valida(text), private.nombre_valido(text) to service_role;
