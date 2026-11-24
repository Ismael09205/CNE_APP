import type { Rol } from '../value-objects/rol';

export type Perfil = {
  readonly id: string;
  readonly cedula: string;
  readonly nombres: string;
  readonly apellidos: string;
  readonly telefono: string;
  readonly correo: string;
  readonly rol: Rol;
  readonly activo: boolean;
  readonly debeCambiarClave: boolean;
  readonly correoVerificado: boolean;
};

/** ADR-02 y ADR-03: sin cuenta activa o con clave temporal no hay acceso a datos electorales. */
export const puedeOperar = (perfil: Perfil): boolean => perfil.activo && !perfil.debeCambiarClave;
