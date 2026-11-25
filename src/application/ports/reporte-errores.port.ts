// Monitoreo de fallos (ADR-18, RF-18). Los casos de uso reportan errores inesperados sin
// conocer Sentry. Nunca se envían cédulas, votos, correos ni otros datos personales.

export type ContextoError = {
  /** Qué se intentaba hacer, p. ej. 'sincronizar_acta'. */
  readonly operacion: string;
  /** Datos técnicos sin información personal (códigos, contadores). */
  readonly datos?: Readonly<Record<string, string | number | boolean>>;
};

export interface ReporteErrores {
  capturar(error: unknown, contexto: ContextoError): void;
  /** Solo el rol de la sesión (sin identidad de la persona). null al cerrar sesión. */
  definirRol(rol: string | null): void;
  /** Ruta de la pantalla abierta (p. ej. '/veedor/acta/alcaldia'), para saber dónde falló. */
  definirPantalla(ruta: string): void;
  /** Solo para demostrar ADR-18: provoca un cierre nativo; el reporte se envía al reabrir la app. */
  probarCierreNativo(): void;
}

/** Para pruebas o cuando el monitoreo está apagado. */
export const reporteNulo: ReporteErrores = {
  capturar: () => undefined,
  definirRol: () => undefined,
  definirPantalla: () => undefined,
  probarCierreNativo: () => undefined,
};
