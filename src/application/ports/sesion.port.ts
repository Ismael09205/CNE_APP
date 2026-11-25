import type { Perfil } from '@/domain/entities/perfil';

export interface SesionActual {
  /** Perfil de quien usa la app. Debe responder sin conexión (sesión y perfil en caché). */
  perfilActual(): Promise<Perfil | null>;
}

/** Avisa cuando se inicia o cierra sesión (o cambia el usuario). */
export interface ObservadorSesion {
  suscribir(alCambiar: (usuarioId: string | null) => void): () => void;
}
