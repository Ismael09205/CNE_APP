import type { Vigencia } from './vigencia';

// ADR-08: un único coordinador vigente por recinto, con historial.
export type CoordinacionRecinto = Vigencia & {
  readonly id: string;
  readonly recintoId: string;
  readonly coordinadorId: string;
};
