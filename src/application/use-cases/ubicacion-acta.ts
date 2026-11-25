// F9 paso 3 — GPS al disparar la foto del acta (RF-13). Funciona sin datos móviles.
// F6-4: la precisión nunca bloquea; si es mala o la ubicación es simulada, se avisa y el acta
// queda marcada para revisión.
import { MENSAJES_REVISION, requiereRevisionUbicacion } from '@/domain/rules/evidencia.rules';
import { fail, ok, type Result } from '@/domain/shared/result';

import type { ErrorCasoDeUso } from '../errores';
import type { FalloGps, LecturaGps, UbicacionGateway } from '../ports/ubicacion.port';

export type UbicacionActa = LecturaGps & {
  readonly requiereRevision: boolean;
  /** Aviso para el veedor cuando la ubicación queda marcada para revisión. */
  readonly aviso: string | null;
};

const MENSAJES: Record<FalloGps, string> = {
  permiso_denegado: 'La app necesita permiso de ubicación para registrar el acta. Actívelo en los ajustes del teléfono.',
  gps_apagado: 'El GPS está apagado. Enciéndalo e intente de nuevo.',
  no_disponible: 'No se pudo obtener la ubicación. Acérquese a una ventana o salga a un lugar abierto e intente de nuevo.',
};

export class TomarUbicacionActa {
  constructor(private readonly deps: { readonly ubicacion: UbicacionGateway }) {}

  async ejecutar(): Promise<Result<UbicacionActa, ErrorCasoDeUso<FalloGps>>> {
    const lectura = await this.deps.ubicacion.leerUbicacionActual();
    if (!lectura.ok) return fail({ codigo: lectura.error, mensaje: MENSAJES[lectura.error] });

    const evidencia = { precisionM: lectura.value.precisionM, ubicacionSimulada: lectura.value.simulada };
    const requiereRevision = requiereRevisionUbicacion(evidencia);
    const aviso = !requiereRevision
      ? null
      : lectura.value.simulada
        ? MENSAJES_REVISION.simulada
        : MENSAJES_REVISION.imprecisa(lectura.value.precisionM);
    return ok({ ...lectura.value, requiereRevision, aviso });
  }
}
