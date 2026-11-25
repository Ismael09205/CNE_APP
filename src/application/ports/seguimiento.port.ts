// Fase 7 (ADR-13, ADR-17): fotos del servidor y aviso de actas nuevas.

/** Foto del acta en el bucket privado: se entrega con una URL firmada de corta duración. */
export interface FotosActaRemotas {
  urlFirmada(fotoPath: string): Promise<string | null>;
}

/** Supabase Realtime: avisa cuando llega un acta (la RLS filtra los eventos, ADR-16). */
export interface ObservadorActas {
  /** Devuelve la función para dejar de escuchar. */
  suscribir(alLlegar: () => void): () => void;
}
