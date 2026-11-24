// El CNE numera las juntas por sexo (JUN INIF–FINF / JUN INIM–FINM del distributivo).
export const SEXOS_JUNTA = ['F', 'M'] as const;
export type SexoJunta = (typeof SEXOS_JUNTA)[number];
