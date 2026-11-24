import type { Acta } from '../entities/acta';
import type { Dignidad } from '../value-objects/dignidad';

// Cola local de envío (ADR-15). La implementación es Expo SQLite.
export interface ActaOutboxRepository {
  existeParaMesaYDignidad(mesaId: string, dignidad: Dignidad): Promise<boolean>;
  /** En UNA transacción: guarda el acta y su foto local y la encola como `pendiente`. */
  guardarYEncolar(acta: Acta): Promise<void>;
}
