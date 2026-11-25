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

/** Persona resumida para mostrar en listas (sin datos sensibles innecesarios). */
export type PersonaResumen = { readonly id: string; readonly nombres: string; readonly apellidos: string; readonly telefono: string };

/** Mesa con su veedor vigente (o null): vista del coordinador de recinto (F7, ADR-09). */
export type MesaConVeedor = Mesa & { readonly veedor: PersonaResumen | null };

/** Orden del CNE: primero sin veedor, luego por sexo y número. */
export const ordenarMesas = <T extends Pick<MesaConVeedor, 'numero' | 'sexo' | 'veedor'>>(mesas: readonly T[]): T[] =>
  [...mesas].sort(
    (a, b) => Number(!!a.veedor) - Number(!!b.veedor) || a.sexo.localeCompare(b.sexo) || a.numero - b.numero,
  );
