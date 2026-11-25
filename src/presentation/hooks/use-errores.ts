// Errores de TanStack Form (esquemas Zod = Standard Schema) y de los casos de uso → texto.
import type { ErrorCasoDeUso } from '@/application/errores';

/** Convierte los errores de un campo (strings o issues con `message`) en mensajes. */
export const mensajesCampo = (errores: readonly unknown[]): string[] =>
  errores
    .map((e) => (typeof e === 'string' ? e : e && typeof e === 'object' && 'message' in e ? String(e.message) : ''))
    .filter(Boolean);

/** Mensaje general de un error de caso de uso (las violaciones por campo ya se ven en el formulario). */
export const mensajeError = (e: ErrorCasoDeUso): string =>
  e.codigo === 'validacion' && e.violaciones?.[0] ? e.violaciones[0].mensaje : e.mensaje;

export const MENSAJE_INESPERADO = 'No se pudo completar la operación. Revise su conexión e intente de nuevo.';
