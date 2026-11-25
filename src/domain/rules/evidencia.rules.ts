// Reglas de la evidencia del acta (RF-13, ADR-13). Decisiones F6-2 y F6-4 del equipo.

/** F6-4: más de 50 m de error (mismo límite que los recintos) marca el acta para revisión. */
export const PRECISION_MAX_ACTA_M = 50;

/**
 * F6-4: la ubicación se registra siempre y nunca bloquea el envío; si es imprecisa
 * o simulada (`mocked`), el acta queda marcada para que el coordinador la revise.
 */
export const requiereRevisionUbicacion = (evidencia: { readonly precisionM: number; readonly ubicacionSimulada: boolean }) =>
  evidencia.ubicacionSimulada || !(evidencia.precisionM <= PRECISION_MAX_ACTA_M);

/** Un acta queda marcada para revisión solo por su ubicación (F6-4; la lectura del código se quitó). */
export const requiereRevisionActa = requiereRevisionUbicacion;

export const MENSAJES_REVISION = {
  simulada: 'El teléfono indica que la ubicación podría no ser real. El acta se guardará igual y su coordinador la revisará.',
  imprecisa: (m: number) =>
    `El GPS ubicó el teléfono con un margen de ${Math.round(m)} m (lo ideal es menos de ${PRECISION_MAX_ACTA_M} m). El acta se guardará igual y su coordinador la revisará.`,
} as const;

/**
 * F6-2: nitidez medida como varianza del Laplaciano sobre la luminancia submuestreada.
 * Debajo de este valor la foto se considera borrosa. VALOR INICIAL: debe calibrarse con
 * fotos reales de actas en el teléfono (ver ESTADO_PROYECTO.md, Fase 6).
 * Referencia con el acta de ejemplo (sources/Papeleta_Ejemplo) a 768×1024, paso 4, sin ruido de
 * sensor: nítida ≈ 3970 · desenfoque gaussiano r=1 ≈ 1780 · r=2 ≈ 520 · r=3 ≈ 165 · r=5 ≈ 27.
 */
export const UMBRAL_NITIDEZ = 120;

/** Cuadros nítidos seguidos que se exigen antes de habilitar el disparo (evita falsos positivos). */
export const CUADROS_NITIDOS_REQUERIDOS = 3;

export const esNitida = (varianza: number) => Number.isFinite(varianza) && varianza >= UMBRAL_NITIDEZ;
