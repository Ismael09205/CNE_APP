import type { Parroquia } from '../entities/parroquia';
import type { Recinto } from '../entities/recinto';
import type { NuevoRecinto } from '../schemas/territorio.schema';
import type { Result } from '../shared/result';

export type RechazoRecinto = 'codigo_duplicado' | 'sin_permiso';

export interface RecintoRepository {
  /** Recintos que la persona puede ver según su rol (RLS, D-24). */
  listarVisibles(): Promise<Recinto[]>;
  listarParroquias(): Promise<Parroquia[]>;
  /** F5: alta por el provincial en su jurisdicción (RLS exige precisión del GPS, D-31). */
  crear(recinto: NuevoRecinto, creadoPor: string): Promise<Result<Recinto, RechazoRecinto>>;
}
