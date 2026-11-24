import type { SexoJunta } from '../value-objects/sexo-junta';

// Una mesa = una junta receptora del voto. Única por (recinto, número, sexo).
export type Mesa = {
  readonly id: string;
  readonly recintoId: string;
  readonly numero: number;
  readonly sexo: SexoJunta;
  /** Electores de la junta. El distributivo solo los trae por recinto, así que puede ser null. */
  readonly numeroElectores: number | null;
};

export const etiquetaMesa = (mesa: Pick<Mesa, 'numero' | 'sexo'>) =>
  `Junta ${mesa.numero} ${mesa.sexo === 'F' ? 'Femenino' : 'Masculino'}`;
