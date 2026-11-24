import type { Vigencia } from './vigencia';

// S-06: solo veedores del mismo recinto pueden reemplazar a otro.
// Tabla propia (no columna en perfiles) por el mismo motivo que ADR-08: conservar el historial.
export type VeedorRecinto = Vigencia & {
  readonly id: string;
  readonly veedorId: string;
  readonly recintoId: string;
};
