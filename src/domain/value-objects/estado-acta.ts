// ADR-14: un acta "enviada" es inmutable.
export const ESTADOS_ACTA = ['borrador', 'enviada'] as const;
export type EstadoActa = (typeof ESTADOS_ACTA)[number];
