import type { Violacion } from '@/domain/shared/violacion';

type IssueLike = { readonly path: readonly PropertyKey[]; readonly code: string; readonly message: string };

/** Traduce issues de los esquemas del dominio al formato Violacion. */
export const aViolaciones = (issues: readonly IssueLike[]): Violacion[] =>
  issues.map((i) => ({
    campo: i.path.filter((p): p is string | number => typeof p !== 'symbol'),
    codigo: i.code,
    mensaje: i.message,
  }));
