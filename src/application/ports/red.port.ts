// Estado de la conexión (NetInfo en infrastructure). ADR-15.
export interface EstadoRed {
  hayConexion(): Promise<boolean>;
  /** Avisa cada vez que cambia la conexión. Devuelve la función para dejar de escuchar. */
  suscribir(alCambiar: (conectado: boolean) => void): () => void;
}
