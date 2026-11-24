import type { AsignacionMesa } from '../entities/asignacion-mesa';
import type { Result } from '../shared/result';

/** Rechazos que la RPC `reemplazar_veedor` puede devolver (validación en el servidor, ADR-10). */
export type RechazoReemplazo =
  | 'no_es_coordinador_vigente'
  | 'mesa_sin_veedor'
  | 'veedor_no_valido'
  | 'veedor_de_otro_recinto'
  | 'veedor_con_otra_mesa'
  | 'reemplazo_concurrente';

export interface AsignacionMesaRepository {
  obtenerVigentePorMesa(mesaId: string): Promise<AsignacionMesa | null>;
  obtenerVigentePorVeedor(veedorId: string): Promise<AsignacionMesa | null>;
  /** RPC transaccional con FOR UPDATE: cierra la asignación vigente y crea la nueva. */
  reemplazarVeedor(mesaId: string, nuevoVeedorId: string): Promise<Result<AsignacionMesa, RechazoReemplazo>>;
}
