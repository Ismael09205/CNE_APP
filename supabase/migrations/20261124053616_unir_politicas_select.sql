-- =============================================================================
-- Fase 2 · Advisor de rendimiento (multiple_permissive_policies): una sola
-- política SELECT por tabla. Misma semántica que las dos anteriores unidas por OR.
-- =============================================================================
drop policy "perfiles: el propio" on public.perfiles;
drop policy "perfiles: segun alcance" on public.perfiles;
create policy "perfiles: el propio o segun alcance" on public.perfiles
  for select to authenticated using (
    id = (select auth.uid())                                        -- D-22
    or id = any ((select private.personas_visibles())::uuid[])     -- D-23
  );

drop policy "veedores_recinto: provincial y coordinador" on public.veedores_recinto;
drop policy "veedores_recinto: el propio vigente" on public.veedores_recinto;
create policy "veedores_recinto: segun rol" on public.veedores_recinto
  for select to authenticated using (
    ((select private.rol_operativo()) in ('coordinador_provincial', 'coordinador_recinto')
      and recinto_id = any ((select private.recintos_visibles())::uuid[]))
    or ((select private.rol_operativo()) = 'veedor' and veedor_id = (select auth.uid()) and hasta is null)
  );

drop policy "asignaciones_mesa: provincial y coordinador" on public.asignaciones_mesa;
drop policy "asignaciones_mesa: la propia vigente" on public.asignaciones_mesa;
create policy "asignaciones_mesa: segun rol" on public.asignaciones_mesa
  for select to authenticated using (
    ((select private.rol_operativo()) in ('coordinador_provincial', 'coordinador_recinto')
      and mesa_id = any ((select private.mesas_visibles())::uuid[]))
    or ((select private.rol_operativo()) = 'veedor' and veedor_id = (select auth.uid()) and hasta is null)
  );
