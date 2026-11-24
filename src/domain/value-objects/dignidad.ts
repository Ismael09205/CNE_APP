// Dos actas por mesa: una por dignidad (ADR-11).
export const DIGNIDADES = ['alcaldia', 'prefectura'] as const;
export type Dignidad = (typeof DIGNIDADES)[number];

export const esDignidad = (valor: unknown): valor is Dignidad => DIGNIDADES.includes(valor as Dignidad);
