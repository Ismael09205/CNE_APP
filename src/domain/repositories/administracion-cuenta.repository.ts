import type { Result } from '../shared/result';

export type RechazoAdministracion = 'sin_permiso';

// Implementación: Edge Functions `restablecer-clave` (F3 asistida) y `desactivar-cuenta` (F4).
export interface AdministracionCuentaRepository {
  /** Nueva clave temporal (se muestra una vez al superior) y vuelve a exigir el cambio. */
  restablecerClave(perfilId: string): Promise<Result<{ readonly claveTemporal: string }, RechazoAdministracion>>;
  desactivar(perfilId: string): Promise<Result<void, RechazoAdministracion>>;
}
