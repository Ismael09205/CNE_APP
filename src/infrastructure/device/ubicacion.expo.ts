// Adaptador de GPS con expo-location (ADR-13). Funciona sin datos móviles.
import * as Location from 'expo-location';

import type { FalloGps, LecturaGps, UbicacionGateway } from '@/application/ports/ubicacion.port';
import { fail, ok, type Result } from '@/domain/shared/result';

export class UbicacionExpo implements UbicacionGateway {
  async leerUbicacionActual(): Promise<Result<LecturaGps, FalloGps>> {
    const permiso = await Location.requestForegroundPermissionsAsync();
    if (permiso.status !== 'granted') return fail('permiso_denegado');
    if (!(await Location.hasServicesEnabledAsync())) return fail('gps_apagado');
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
      if (pos.coords.accuracy == null) return fail('no_disponible');
      return ok({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        precisionM: pos.coords.accuracy,
        simulada: pos.mocked === true, // solo Android lo informa
      });
    } catch {
      return fail('no_disponible');
    }
  }
}
