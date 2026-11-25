import type { PersonaResumen } from './mesa';
import type { Vigencia } from './vigencia';

// S-06: solo veedores del mismo recinto pueden reemplazar a otro.
// Tabla propia (no columna en perfiles) por el mismo motivo que ADR-08: conservar el historial.
export type VeedorRecinto = Vigencia & {
  readonly id: string;
  readonly veedorId: string;
  readonly recintoId: string;
};

/** Veedor registrado en el recinto y su mesa vigente (null = libre). */
export type VeedorDelRecinto = PersonaResumen & { readonly activo: boolean; readonly mesaId: string | null };

export const veedoresLibres = (veedores: readonly VeedorDelRecinto[]) => veedores.filter((v) => v.activo && v.mesaId === null);
