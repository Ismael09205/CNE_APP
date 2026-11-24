import type { Candidatura } from '../entities/candidatura';
import type { Dignidad } from '../value-objects/dignidad';

export interface CandidaturaRepository {
  /**
   * Candidaturas de la dignidad en la circunscripción de la mesa (cantón o provincia).
   * Debe responder sin conexión (catálogo en caché local).
   */
  listarParaMesa(mesaId: string, dignidad: Dignidad): Promise<Candidatura[]>;
}
