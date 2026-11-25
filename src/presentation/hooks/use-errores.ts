// Errores de TanStack Form (esquemas Zod = Standard Schema) y de los casos de uso → texto.
import type { ErrorCasoDeUso } from '@/application/errores';
import { reporteNulo, type ReporteErrores } from '@/application/ports/reporte-errores.port';

/** Convierte los errores de un campo (strings o issues con `message`) en mensajes. */
export const mensajesCampo = (errores: readonly unknown[]): string[] =>
  errores
    .map((e) => (typeof e === 'string' ? e : e && typeof e === 'object' && 'message' in e ? String(e.message) : ''))
    .filter(Boolean);

/** Mensaje general de un error de caso de uso (las violaciones por campo ya se ven en el formulario). */
export const mensajeError = (e: ErrorCasoDeUso): string =>
  e.codigo === 'validacion' && e.violaciones?.[0] ? e.violaciones[0].mensaje : e.mensaje;

export const MENSAJE_INESPERADO = 'No se pudo completar la operación. Revise su conexión e intente de nuevo.';

// ADR-18: los errores inesperados que la UI muestra con MENSAJE_INESPERADO también se reportan
// (sin datos personales; la limpieza la hace el adaptador de monitoreo). ContenedorProvider
// registra el reporte al montarse; antes de eso no se envía nada.
let reporte: ReporteErrores = reporteNulo;

export const registrarReporteErrores = (r: ReporteErrores) => {
  reporte = r;
};

/** Reporta un error inesperado con el nombre de la operación que falló (p. ej. 'guardar_acta'). */
export const reportarInesperado = (error: unknown, operacion: string) => reporte.capturar(error, { operacion });
