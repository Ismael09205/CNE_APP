// F2 y F3 — Acceso, primer ingreso y recuperación de clave.
// RF-02, RF-03, RF-05, RF-06, ADR-02, ADR-03, ADR-05, ADR-06, D-25, D-26, D-27.
import type { Perfil } from '@/domain/entities/perfil';
import {
  codigoYClaveSchema,
  inicioSesionSchema,
  solicitudCodigoSchema,
  type CodigoYClaveInput,
  type InicioSesionInput,
  type SolicitudCodigoInput,
} from '@/domain/schemas/auth.schema';
import { fail, ok, type Result } from '@/domain/shared/result';

import { errorValidacion, type ErrorCasoDeUso } from '../errores';
import type {
  AutenticacionGateway,
  FalloAutenticacion,
  PrimerIngresoGateway,
  RechazoPrimerIngreso,
} from '../ports/autenticacion.port';
import type { SesionActual } from '../ports/sesion.port';
import { aViolaciones } from '../zod-violaciones';

export type CodigoErrorAcceso =
  | FalloAutenticacion
  | RechazoPrimerIngreso
  | 'validacion'
  | 'sin_sesion'
  | 'sin_perfil'
  | 'cuenta_inactiva';

export const MENSAJES_ACCESO: Record<Exclude<CodigoErrorAcceso, 'validacion'>, string> = {
  credenciales: 'El correo o la clave no son correctos.',
  cuenta_bloqueada: 'Su cuenta está desactivada. Comuníquese con su coordinador.',
  cuenta_inactiva: 'Su cuenta está desactivada. Comuníquese con su coordinador.',
  codigo_invalido: 'El código no es correcto o ya venció. Pida uno nuevo.',
  codigo_requerido: 'Primero confirme el código que llegó a su correo.',
  sin_conexion: 'No hay conexión a internet. Este paso necesita conexión.',
  demasiados_intentos: 'Hizo demasiados intentos. Espere unos minutos e intente de nuevo.',
  clave_debil: 'La clave debe tener al menos 8 caracteres, con letras y números.',
  no_requerido: 'Su clave ya había sido cambiada. Ingrese con su correo y su clave nueva.',
  sin_sesion: 'Su sesión terminó. Ingrese de nuevo.',
  sin_perfil: 'Su cuenta no tiene un perfil registrado. Comuníquese con su coordinador.',
};

const error = (codigo: Exclude<CodigoErrorAcceso, 'validacion'>): ErrorCasoDeUso<CodigoErrorAcceso> => ({
  codigo,
  mensaje: MENSAJES_ACCESO[codigo],
});

type Resultado<T> = Promise<Result<T, ErrorCasoDeUso<CodigoErrorAcceso>>>;

/** F2 paso 1 — Ingreso con correo y clave (temporal o definitiva). */
export class IniciarSesion {
  constructor(private readonly deps: { auth: AutenticacionGateway; sesion: SesionActual }) {}

  async ejecutar(input: InicioSesionInput): Resultado<Perfil> {
    const parse = inicioSesionSchema.safeParse(input);
    if (!parse.success) return fail(errorValidacion(aViolaciones(parse.error.issues)));

    const ingreso = await this.deps.auth.iniciarSesion(parse.data.correo, parse.data.clave);
    if (!ingreso.ok) return fail(error(ingreso.error));

    const perfil = await this.deps.sesion.perfilActual();
    if (!perfil) {
      await this.deps.auth.cerrarSesion();
      return fail(error('sin_perfil'));
    }
    if (!perfil.activo) {
      await this.deps.auth.cerrarSesion();
      return fail(error('cuenta_inactiva'));
    }
    return ok(perfil);
  }
}

/** F2 paso 2 — Envía el código al correo de la sesión con clave temporal. */
export class SolicitarCodigoPrimerIngreso {
  constructor(private readonly deps: { auth: AutenticacionGateway }) {}

  async ejecutar(): Resultado<{ readonly correo: string }> {
    const correo = await this.deps.auth.correoSesion();
    if (!correo) return fail(error('sin_sesion'));
    const envio = await this.deps.auth.enviarCodigoAcceso(correo);
    return envio.ok ? ok({ correo }) : fail(error(envio.error));
  }
}

/** Mensaje que ve la persona en el ingreso después de guardar su clave nueva. */
export const MENSAJE_CLAVE_GUARDADA = 'Listo: su clave nueva quedó guardada. Ahora ingrese con su correo y su clave nueva.';

/**
 * Al cambiar la clave, el servidor cierra las sesiones de la cuenta. Por eso, al terminar
 * (o si la clave ya estaba cambiada) se cierra también la sesión del teléfono y la persona
 * vuelve al ingreso con un mensaje claro, en vez de quedar en una sesión que ya no sirve.
 */
async function cerrarTrasCambio(auth: AutenticacionGateway): Promise<void> {
  await auth.cerrarSesion().catch(() => undefined);
}

/** F2 pasos 3 y 4 — Código del correo + clave nueva: verifica el correo y libera la cuenta. */
export class CompletarPrimerIngreso {
  constructor(private readonly deps: { auth: AutenticacionGateway; primerIngreso: PrimerIngresoGateway }) {}

  async ejecutar(input: CodigoYClaveInput): Resultado<void> {
    const parse = codigoYClaveSchema.safeParse(input);
    if (!parse.success) return fail(errorValidacion(aViolaciones(parse.error.issues)));

    const correo = await this.deps.auth.correoSesion();
    if (!correo) return fail(error('sin_sesion'));

    const verificado = await this.deps.auth.verificarCodigoAcceso(correo, parse.data.codigo);
    if (!verificado.ok) return fail(error(verificado.error));

    const completado = await this.deps.primerIngreso.completar(parse.data.clave);
    if (completado.ok || completado.error === 'no_requerido') await cerrarTrasCambio(this.deps.auth);
    return completado.ok ? ok(undefined) : fail(error(completado.error));
  }
}

/** F3 autónoma paso 1 — Código de recuperación al correo. */
export class SolicitarRecuperacion {
  constructor(private readonly deps: { auth: AutenticacionGateway }) {}

  async ejecutar(input: SolicitudCodigoInput): Resultado<{ readonly correo: string }> {
    const parse = solicitudCodigoSchema.safeParse(input);
    if (!parse.success) return fail(errorValidacion(aViolaciones(parse.error.issues)));
    const envio = await this.deps.auth.enviarCodigoRecuperacion(parse.data.correo);
    // Por privacidad la respuesta es la misma exista o no la cuenta (lo maneja Supabase).
    return envio.ok ? ok({ correo: parse.data.correo }) : fail(error(envio.error));
  }
}

/** F3 autónoma paso 2 — Código + clave nueva. Si la cuenta tenía clave temporal, completa el primer ingreso. */
export class RestablecerConCodigo {
  constructor(
    private readonly deps: { auth: AutenticacionGateway; sesion: SesionActual; primerIngreso: PrimerIngresoGateway },
  ) {}

  async ejecutar(correo: string, input: CodigoYClaveInput): Resultado<void> {
    const parse = codigoYClaveSchema.safeParse(input);
    if (!parse.success) return fail(errorValidacion(aViolaciones(parse.error.issues)));

    const verificado = await this.deps.auth.verificarCodigoRecuperacion(correo.trim().toLowerCase(), parse.data.codigo);
    if (!verificado.ok) return fail(error(verificado.error));

    const perfil = await this.deps.sesion.perfilActual();
    if (!perfil) return fail(error('sin_perfil'));
    if (!perfil.activo) {
      await this.deps.auth.cerrarSesion();
      return fail(error('cuenta_inactiva'));
    }

    const cambio = perfil.debeCambiarClave
      ? await this.deps.primerIngreso.completar(parse.data.clave)
      : await this.deps.auth.actualizarClave(parse.data.clave);
    if (cambio.ok || cambio.error === 'no_requerido') await cerrarTrasCambio(this.deps.auth);
    return cambio.ok ? ok(undefined) : fail(error(cambio.error));
  }
}

export class CerrarSesion {
  constructor(private readonly deps: { auth: AutenticacionGateway }) {}

  ejecutar(): Promise<void> {
    return this.deps.auth.cerrarSesion();
  }
}
