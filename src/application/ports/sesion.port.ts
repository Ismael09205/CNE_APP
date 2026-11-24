import type { Perfil } from '@/domain/entities/perfil';

export interface SesionActual {
  /** Perfil de quien usa la app. Debe responder sin conexión (sesión y perfil en caché). */
  perfilActual(): Promise<Perfil | null>;
}
