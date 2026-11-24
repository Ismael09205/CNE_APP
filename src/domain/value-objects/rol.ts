export const ROLES = ['coordinador_provincial', 'coordinador_recinto', 'veedor'] as const;
export type Rol = (typeof ROLES)[number];

export const esRol = (valor: unknown): valor is Rol => ROLES.includes(valor as Rol);
