import type { Mesa, MesaConVeedor } from '../entities/mesa';
import type { RangoMesas } from '../schemas/territorio.schema';
import type { Result } from '../shared/result';

export type RechazoMesas = { readonly codigo: 'mesas_existentes'; readonly existentes: string } | { readonly codigo: 'sin_permiso' | 'rango_invalido' };

export interface MesaRepository {
  /** Debe responder sin conexión para las mesas del propio veedor (caché local). */
  obtenerPorId(id: string): Promise<Mesa | null>;
  /** F7: mesas del recinto con su veedor vigente. */
  listarPorRecinto(recintoId: string): Promise<MesaConVeedor[]>;
  /** F5: RPC `agregar_mesas` (D-32). Devuelve cuántas se crearon. */
  agregarRango(recintoId: string, rango: RangoMesas): Promise<Result<number, RechazoMesas>>;
}
