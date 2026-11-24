import type { NuevaCuenta } from '../schemas/perfil.schema';
import type { Result } from '../shared/result';

export type CuentaCreada = {
  readonly perfilId: string;
  /** La genera el servidor y se muestra una sola vez al superior (F1). */
  readonly claveTemporal: string;
};

export type RechazoCrearCuenta = 'sin_permiso' | 'cedula_duplicada' | 'correo_duplicado' | 'recinto_no_valido';

// Implementación: Edge Function `crear-cuenta` (ADR-01). La service_role nunca sale del servidor.
export interface CuentaRepository {
  crear(cuenta: NuevaCuenta): Promise<Result<CuentaCreada, RechazoCrearCuenta>>;
}
