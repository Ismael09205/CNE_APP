import type { Dignidad } from '../value-objects/dignidad';
import type { EstadoEnvio } from '../value-objects/estado-envio';
import type { Acta } from './acta';

// Un acta en la cola local de envío (ADR-15, F10). El acta es inmutable; solo cambia el estado del envío.
export type EnvioActa = {
  readonly acta: Acta;
  readonly estado: EstadoEnvio;
  readonly intentos: number;
  /** Código del último rechazo o fallo (para mostrar un mensaje y diagnosticar). */
  readonly ultimoError: string | null;
  readonly actualizadoEn: Date;
};

/** Resumen por dignidad para la pantalla de la mesa (RNF-09). */
export type ResumenEnvio = {
  readonly actaId: string;
  readonly mesaId: string;
  readonly dignidad: Dignidad;
  readonly estado: EstadoEnvio;
  readonly ultimoError: string | null;
  readonly requiereRevision: boolean;
};

/** Estados que el sincronizador debe volver a intentar. */
export const ESTADOS_REINTENTABLES: readonly EstadoEnvio[] = ['pendiente', 'enviando'];

/** Espera entre reintentos por fallas de red: 5 s, 10 s, 20 s… hasta 5 minutos. */
export const esperaReintentoMs = (intentos: number) => Math.min(5_000 * 2 ** Math.max(0, intentos - 1), 300_000);
