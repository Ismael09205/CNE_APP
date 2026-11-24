import { validarResultadosActa, type OpcionesValidacionActa, type ResultadosActaInput } from '../rules/acta.rules';
import { fail, ok, type Result } from '../shared/result';
import type { Violacion } from '../shared/violacion';
import type { Dignidad } from '../value-objects/dignidad';
import type { EstadoActa } from '../value-objects/estado-acta';

// RF-13: un acta sin foto y ubicación no sirve.
export type EvidenciaActa = {
  /** Ruta local de la foto (documentos de la app) o ruta en Storage, según la capa. */
  readonly fotoPath: string;
  readonly lat: number;
  readonly lng: number;
  readonly precisionM: number;
  /** `mocked` de expo-location: se registra, el revisor decide. */
  readonly ubicacionSimulada: boolean;
  readonly capturadaEn: Date;
};

export type Acta = ResultadosActaInput & {
  /** UUID generado en el cliente al confirmar (idempotencia, §4.5). */
  readonly id: string;
  readonly mesaId: string;
  readonly dignidad: Dignidad;
  readonly veedorId: string;
  readonly estado: EstadoActa;
  readonly confirmadaEn: Date;
  readonly evidencia: EvidenciaActa;
};

export const MENSAJES_EVIDENCIA = {
  foto: 'Falta la foto del acta.',
  ubicacion: 'Falta la ubicación del registro. Active el GPS e intente de nuevo.',
  precision: 'La precisión de la ubicación no es válida.',
  fecha: 'Falta la hora de captura de la foto.',
} as const;

export function validarEvidencia(evidencia: EvidenciaActa): Violacion[] {
  const v: Violacion[] = [];
  if (!evidencia.fotoPath.trim()) v.push({ campo: ['evidencia', 'fotoPath'], codigo: 'foto_requerida', mensaje: MENSAJES_EVIDENCIA.foto });
  const latOk = Number.isFinite(evidencia.lat) && Math.abs(evidencia.lat) <= 90;
  const lngOk = Number.isFinite(evidencia.lng) && Math.abs(evidencia.lng) <= 180;
  if (!latOk || !lngOk) v.push({ campo: ['evidencia', 'ubicacion'], codigo: 'ubicacion_requerida', mensaje: MENSAJES_EVIDENCIA.ubicacion });
  if (!Number.isFinite(evidencia.precisionM) || evidencia.precisionM < 0) {
    v.push({ campo: ['evidencia', 'precisionM'], codigo: 'precision_invalida', mensaje: MENSAJES_EVIDENCIA.precision });
  }
  if (!(evidencia.capturadaEn instanceof Date) || Number.isNaN(evidencia.capturadaEn.getTime())) {
    v.push({ campo: ['evidencia', 'capturadaEn'], codigo: 'fecha_requerida', mensaje: MENSAJES_EVIDENCIA.fecha });
  }
  return v;
}

export type DatosConfirmacionActa = Omit<Acta, 'estado'>;

/**
 * Crea un acta definitiva (estado `enviada`). Desde aquí es inmutable (RF-14, S-07, S-08):
 * el objeto se congela y no existe ninguna operación de edición.
 */
export function confirmarActa(datos: DatosConfirmacionActa, opciones: OpcionesValidacionActa): Result<Acta, Violacion[]> {
  const violaciones = [...validarResultadosActa(datos, opciones), ...validarEvidencia(datos.evidencia)];
  if (violaciones.length > 0) return fail(violaciones);

  const acta: Acta = {
    ...datos,
    votos: Object.freeze(datos.votos.map((v) => Object.freeze({ ...v }))),
    evidencia: Object.freeze({ ...datos.evidencia }),
    estado: 'enviada',
  };
  return ok(Object.freeze(acta));
}
