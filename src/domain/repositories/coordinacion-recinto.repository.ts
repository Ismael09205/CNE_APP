import type { CoordinacionRecinto } from '../entities/coordinacion-recinto';
import type { PersonaResumen } from '../entities/mesa';
import type { Result } from '../shared/result';

export type RechazoCoordinacion = 'sin_permiso' | 'coordinador_no_valido' | 'ya_asignado' | 'coordinador_con_recinto';

export type CoordinacionVigente = { readonly recintoId: string; readonly coordinador: PersonaResumen };

export interface CoordinacionRecintoRepository {
  obtenerVigentePorRecinto(recintoId: string): Promise<CoordinacionRecinto | null>;
  /** Coordinaciones vigentes visibles (provincial: su jurisdicción). */
  listarVigentes(): Promise<CoordinacionVigente[]>;
  /** F6: RPC `asignar_coordinador` (ADR-08). */
  asignar(recintoId: string, coordinadorId: string): Promise<Result<void, RechazoCoordinacion>>;
}
