// Violación de una regla de negocio, asociada al campo que la provoca (RNF-06).
export type Violacion = {
  /** Ruta del campo, compatible con Zod y TanStack Form. Ej.: ['votos', 2, 'votos']. */
  readonly campo: readonly (string | number)[];
  readonly codigo: string;
  /** Mensaje en español, comprensible para personas mayores. */
  readonly mensaje: string;
};
