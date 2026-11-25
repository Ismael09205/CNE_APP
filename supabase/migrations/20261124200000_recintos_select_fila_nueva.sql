-- INSERT ... RETURNING evalúa la política SELECT sobre la fila nueva, pero
-- private.recintos_visibles() lee `recintos` con la foto previa a la sentencia y
-- no la incluye: el alta desde la app fallaba con 42501. Se agrega una condición
-- que se evalúa sobre la propia fila (misma regla de jurisdicción, D-24).
drop policy "recintos: segun alcance" on public.recintos;
create policy "recintos: segun alcance" on public.recintos
  for select to authenticated using (
    id = any ((select private.recintos_visibles())::uuid[])
    or ((select private.rol_operativo()) = 'coordinador_provincial'
        and private.parroquia_en_jurisdiccion(parroquia_id))
  );
