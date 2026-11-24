import type { Violacion } from '@/domain/shared/violacion';

// Error esperado de un caso de uso: un código estable para la UI y un mensaje en español (RNF-06).
export type ErrorCasoDeUso<C extends string = string> = {
  readonly codigo: C;
  readonly mensaje: string;
  /** Solo para codigo 'validacion': errores por campo. */
  readonly violaciones?: readonly Violacion[];
};

export const errorValidacion = (violaciones: readonly Violacion[]): ErrorCasoDeUso<'validacion'> => ({
  codigo: 'validacion',
  mensaje: 'Revise los datos marcados.',
  violaciones,
});
