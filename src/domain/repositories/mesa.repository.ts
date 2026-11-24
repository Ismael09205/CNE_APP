import type { Mesa } from '../entities/mesa';

export interface MesaRepository {
  /** Debe responder sin conexión para las mesas del propio veedor (caché local). */
  obtenerPorId(id: string): Promise<Mesa | null>;
}
