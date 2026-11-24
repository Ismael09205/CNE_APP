// Patrón de vigencia compartido por coordinaciones, asignaciones y membresías (ADR-08, ADR-09).
export type Vigencia = { readonly desde: Date; readonly hasta: Date | null };

export const estaVigente = (v: Vigencia): boolean => v.hasta === null;
