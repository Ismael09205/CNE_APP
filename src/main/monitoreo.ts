// Composition root del monitoreo (ADR-18): la capa de rutas (src/app) solo usa esto, no Sentry.
export { envolverRaiz, iniciarSentry, monitoreoActivo, navegacionSentry } from '@/infrastructure/monitoring/sentry';
