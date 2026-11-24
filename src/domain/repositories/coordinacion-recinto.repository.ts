import type { CoordinacionRecinto } from '../entities/coordinacion-recinto';

export interface CoordinacionRecintoRepository {
  obtenerVigentePorRecinto(recintoId: string): Promise<CoordinacionRecinto | null>;
}
