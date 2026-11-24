-- =============================================================================
-- Fase 2 · Las validaciones de integridad no dependen de la RLS de quien llama.
-- Los triggers corren con el rol del cliente (p. ej. el veedor que inserta un
-- acta). Si validar_acta/exigir_rol leyeran con su RLS, una fila oculta podría
-- hacer pasar en falso la regla "faltan listas". Se ejecutan como dueño.
-- Siguen en `private` (fuera de la Data API) y solo validan o lanzan error.
-- =============================================================================
alter function private.validar_acta(uuid) security definer;
alter function private.exigir_rol(uuid, text) security definer;

grant execute on function private.validar_acta(uuid), private.exigir_rol(uuid, text) to authenticated;
