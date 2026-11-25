import type { AsignacionMesa } from '../entities/asignacion-mesa';
import type { Result } from '../shared/result';

/** Rechazos que las RPC `asignar_veedor` y `reemplazar_veedor` pueden devolver (ADR-09, ADR-10). */
export type RechazoReemplazo =
  | 'no_es_coordinador_vigente'
  | 'mesa_sin_veedor'
  | 'veedor_no_valido'
  | 'veedor_de_otro_recinto'
  | 'veedor_con_otra_mesa'
  | 'reemplazo_concurrente';

export type RechazoAsignacion = Exclude<RechazoReemplazo, 'mesa_sin_veedor'> | 'mesa_con_veedor';

export interface AsignacionMesaRepository {
  obtenerVigentePorMesa(mesaId: string): Promise<AsignacionMesa | null>;
  obtenerVigentePorVeedor(veedorId: string): Promise<AsignacionMesa | null>;
  /** F7: primera asignación de una mesa sin veedor. */
  asignarVeedor(mesaId: string, veedorId: string): Promise<Result<void, RechazoAsignacion>>;
  /**
   * F8: RPC transaccional con FOR UPDATE. `veedorActualId` es el que la app mostraba:
   * si cambió mientras tanto, el servidor responde `reemplazo_concurrente`.
   */
  reemplazarVeedor(mesaId: string, veedorActualId: string, nuevoVeedorId: string): Promise<Result<void, RechazoReemplazo>>;
}
