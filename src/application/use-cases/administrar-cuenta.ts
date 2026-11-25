// F3 asistida y F4 — el superior restablece la clave o desactiva una cuenta (S-03, ADR-02, ADR-06, D-28).
// La Edge Function revalida los permisos en el servidor; aquí se evita la llamada
// cuando es obvio que no procede y se dan mensajes claros.
import { puedeOperar } from '@/domain/entities/perfil';
import type { AdministracionCuentaRepository } from '@/domain/repositories/administracion-cuenta.repository';
import { fail, ok, type Result } from '@/domain/shared/result';

import type { ErrorCasoDeUso } from '../errores';
import type { SesionActual } from '../ports/sesion.port';

export type CodigoErrorAdministracion = 'sin_sesion' | 'sin_permiso' | 'misma_cuenta';

const MENSAJES: Record<CodigoErrorAdministracion, string> = {
  sin_sesion: 'Su sesión terminó. Ingrese de nuevo.',
  sin_permiso: 'Usted no puede administrar esta cuenta.',
  misma_cuenta: 'No puede hacer esto con su propia cuenta.',
};

const error = (codigo: CodigoErrorAdministracion): ErrorCasoDeUso<CodigoErrorAdministracion> => ({
  codigo,
  mensaje: MENSAJES[codigo],
});

type Deps = { readonly sesion: SesionActual; readonly cuentas: AdministracionCuentaRepository };

async function validarActor(sesion: SesionActual, perfilId: string): Promise<ErrorCasoDeUso<CodigoErrorAdministracion> | null> {
  const actor = await sesion.perfilActual();
  if (!actor) return error('sin_sesion');
  if (actor.id === perfilId) return error('misma_cuenta');
  if (actor.rol === 'veedor' || !puedeOperar(actor)) return error('sin_permiso');
  return null;
}

export class RestablecerClaveAsistido {
  constructor(private readonly deps: Deps) {}

  async ejecutar(perfilId: string): Promise<Result<{ readonly claveTemporal: string }, ErrorCasoDeUso<CodigoErrorAdministracion>>> {
    const rechazo = await validarActor(this.deps.sesion, perfilId);
    if (rechazo) return fail(rechazo);
    const r = await this.deps.cuentas.restablecerClave(perfilId);
    return r.ok ? ok(r.value) : fail(error(r.error));
  }
}

export class DesactivarCuenta {
  constructor(private readonly deps: Deps) {}

  async ejecutar(perfilId: string): Promise<Result<void, ErrorCasoDeUso<CodigoErrorAdministracion>>> {
    const rechazo = await validarActor(this.deps.sesion, perfilId);
    if (rechazo) return fail(rechazo);
    const r = await this.deps.cuentas.desactivar(perfilId);
    return r.ok ? ok(undefined) : fail(error(r.error));
  }
}
