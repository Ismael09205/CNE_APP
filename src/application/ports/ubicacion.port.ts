import type { Result } from '@/domain/shared/result';

export type LecturaGps = { readonly lat: number; readonly lng: number; readonly precisionM: number; readonly simulada: boolean };
export type FalloGps = 'permiso_denegado' | 'gps_apagado' | 'no_disponible';

// expo-location en infrastructure.
export interface UbicacionGateway {
  /** Lectura de alta precisión del GPS (funciona sin datos móviles). */
  leerUbicacionActual(): Promise<Result<LecturaGps, FalloGps>>;
}
