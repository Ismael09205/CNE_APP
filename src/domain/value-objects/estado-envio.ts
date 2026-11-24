// Estado visible de cada acta en la cola de envío (RNF-09, F10).
export const ESTADOS_ENVIO = ['pendiente', 'enviando', 'guardada', 'error', 'conflicto'] as const;
export type EstadoEnvio = (typeof ESTADOS_ENVIO)[number];
