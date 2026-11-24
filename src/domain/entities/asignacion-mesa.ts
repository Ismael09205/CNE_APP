import type { Vigencia } from './vigencia';

// ADR-09: un veedor vigente por mesa y una mesa vigente por veedor (S-04).
export type AsignacionMesa = Vigencia & {
  readonly id: string;
  readonly mesaId: string;
  readonly veedorId: string;
  readonly asignadoPor: string;
};
