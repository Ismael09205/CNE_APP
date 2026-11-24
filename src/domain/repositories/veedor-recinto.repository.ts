import type { VeedorRecinto } from '../entities/veedor-recinto';

export interface VeedorRecintoRepository {
  obtenerVigentePorVeedor(veedorId: string): Promise<VeedorRecinto | null>;
}
