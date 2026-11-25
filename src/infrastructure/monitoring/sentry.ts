// Sentry (ADR-18, RF-18): cierres nativos y errores de JS con la pantalla (Expo Router),
// el dispositivo y la versión de Android. Sin DSN (EXPO_PUBLIC_SENTRY_DSN) queda apagado
// y no envía nada (D-20). `sendDefaultPii: false` + limpieza propia (limpieza.ts).
import * as Sentry from '@sentry/react-native';

import type { ContextoError, ReporteErrores } from '@/application/ports/reporte-errores.port';

import { limpiarEvento, limpiarMiga } from './limpieza';

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

export const monitoreoActivo = !!DSN;

/** Pantalla donde ocurrió el fallo (se registra con el contenedor de navegación de Expo Router). */
export const navegacionSentry = Sentry.reactNavigationIntegration({ enableTimeToInitialDisplay: true });

let iniciado = false;

export function iniciarSentry(): void {
  if (!DSN || iniciado) return;
  iniciado = true;
  Sentry.init({
    dsn: DSN,
    environment: __DEV__ ? 'desarrollo' : 'produccion',
    sendDefaultPii: false,
    // Pocas trazas de rendimiento para no gastar la cuota del plan gratuito.
    tracesSampleRate: __DEV__ ? 0.2 : 0.1,
    integrations: [navegacionSentry],
    beforeSend: (evento) => limpiarEvento(evento),
    beforeSendTransaction: (evento) => limpiarEvento(evento),
    beforeBreadcrumb: (miga) => limpiarMiga(miga),
  });
}

export const envolverRaiz = <P extends Record<string, unknown>>(Componente: React.ComponentType<P>) =>
  DSN ? Sentry.wrap(Componente) : Componente;

export class ReporteSentry implements ReporteErrores {
  capturar(error: unknown, contexto: ContextoError): void {
    if (!DSN) return;
    Sentry.withScope((scope) => {
      scope.setTag('operacion', contexto.operacion);
      if (contexto.datos) scope.setContext('datos', { ...contexto.datos });
      Sentry.captureException(error);
    });
  }

  definirRol(rol: string | null): void {
    if (!DSN) return;
    // Solo el rol: Sentry agrupa "usuarios afectados" sin saber quién es la persona.
    Sentry.setUser(rol ? { rol } : null);
  }

  probarCierreNativo(): void {
    if (!DSN) return;
    Sentry.nativeCrash();
  }

  definirPantalla(ruta: string): void {
    if (!DSN) return;
    // Las rutas de la app no llevan datos personales (los ids son UUID, que la limpieza no toca).
    Sentry.setTag('pantalla', ruta);
  }
}
