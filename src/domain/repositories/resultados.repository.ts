import type { ActaRecibida, AvanceRecinto, DetalleActa, ResumenVotos, TotalCandidatura } from '../entities/resultados';
import type { Dignidad } from '../value-objects/dignidad';

// Fase 7 (ADR-17): consultas de seguimiento. La RLS limita cada respuesta al alcance de quien pregunta.
export interface ResultadosRepository {
  /** RPC `avance_por_recinto`. */
  avancePorRecinto(): Promise<AvanceRecinto[]>;
  /** RPC `totales_por_candidato`; sin recinto = total del alcance. */
  totalesPorCandidato(dignidad: Dignidad, recintoId?: string): Promise<TotalCandidatura[]>;
  /** RPC `resumen_votos`. */
  resumenVotos(dignidad: Dignidad, recintoId?: string): Promise<ResumenVotos>;
  /** Actas enviadas de las mesas de un recinto. */
  actasDeRecinto(recintoId: string): Promise<ActaRecibida[]>;
  detalleActa(actaId: string): Promise<DetalleActa | null>;
}
