import type { Dignidad } from '../value-objects/dignidad';

// Una candidatura = una lista inscrita para una dignidad en la circunscripción.
// Fuente: sources/Candidatos/candidaturas_prefectura_alcaldia.json.
// Reemplaza "5 organizaciones fijas" (RNF-03): hay 4 listas de prefectura y 5 de alcaldía,
// y algunas son alianzas (ej. "70-17", "103-62").
export type Candidatura = {
  readonly id: string;
  readonly dignidad: Dignidad;
  /** Circunscripción: prefectura → provincia; alcaldía → cantón (y su provincia). */
  readonly provinciaId: number;
  readonly cantonId: number | null;
  /** Número de lista tal como lo publica el CNE: "7", "70-17", "103-62". */
  readonly lista: string;
  readonly organizacionPolitica: string;
  /** Alcalde/sa o prefecto/a. */
  readonly candidato: string;
  /** Viceprefecto/a del binomio. null en alcaldía. */
  readonly binomio: string | null;
  /** Color de identidad (RNF-07), tomado del logo de la lista. */
  readonly color: string;
};
