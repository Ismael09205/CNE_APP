-- El trigger vigencia_exige_rol (invoker) llama a exigir_rol; service_role inserta
-- coordinaciones_provinciales directamente en el script del primer provincial.
grant execute on function private.exigir_rol(uuid, text) to service_role;
