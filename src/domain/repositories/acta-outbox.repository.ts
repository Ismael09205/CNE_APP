import type { Acta } from '../entities/acta';
import type { EnvioActa } from '../entities/envio-acta';
import type { Dignidad } from '../value-objects/dignidad';
import type { EstadoEnvio } from '../value-objects/estado-envio';

// Cola local de envío (ADR-15). La implementación es Expo SQLite cifrada (F6-3).
export interface ActaOutboxRepository {
  existeParaMesaYDignidad(mesaId: string, dignidad: Dignidad): Promise<boolean>;
  /** En UNA transacción: guarda el acta y su foto local y la encola como `pendiente`. */
  guardarYEncolar(acta: Acta): Promise<void>;
  /** Actas del veedor que el sincronizador debe enviar (`pendiente` o `enviando` interrumpido). */
  listarPorEnviar(veedorId: string): Promise<EnvioActa[]>;
  /** Todas las actas locales de una mesa (estado visible, RNF-09). */
  listarPorMesa(mesaId: string): Promise<EnvioActa[]>;
  /** Cambia el estado del envío. `contarIntento` suma 1 a los intentos (fallas de red). */
  marcar(actaId: string, estado: EstadoEnvio, cambios?: { readonly error?: string | null; readonly contarIntento?: boolean }): Promise<void>;
}
