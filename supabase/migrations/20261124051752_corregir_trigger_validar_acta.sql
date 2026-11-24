-- =============================================================================
-- Fase 1 · Migración 4: corrección encontrada por supabase/tests/fase1_reglas.sql
-- En PL/pgSQL, CASE resuelve ambos campos (new.id y new.acta_id) y falla en la
-- tabla que no tiene ese campo. Se separa por IF.
-- =============================================================================
create or replace function private.validar_acta_trigger()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'actas' then
    perform private.validar_acta(new.id);
  else
    perform private.validar_acta(new.acta_id);
  end if;
  return null;
end;
$$;
