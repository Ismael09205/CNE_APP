import type { VeedorDelRecinto, VeedorRecinto } from '../entities/veedor-recinto';

export interface VeedorRecintoRepository {
  obtenerVigentePorVeedor(veedorId: string): Promise<VeedorRecinto | null>;
  /** Veedores registrados (vigentes) en el recinto, con su mesa vigente. */
  listarPorRecinto(recintoId: string): Promise<VeedorDelRecinto[]>;
}
