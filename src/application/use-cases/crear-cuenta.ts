// F1 — Alta de cuenta por un superior (RF-01, RF-02, RF-04, S-01, ADR-01, ADR-04).
// Permisos (decisión del equipo): el coordinador provincial crea coordinadores de recinto y
// veedores; el coordinador de recinto crea solo veedores de su recinto. La Edge Function
// `crear-cuenta` vuelve a validar todo en el servidor.
import { puedeOperar } from '@/domain/entities/perfil';
import type { CoordinacionRecintoRepository } from '@/domain/repositories/coordinacion-recinto.repository';
import type { CuentaCreada, CuentaRepository, RechazoCrearCuenta } from '@/domain/repositories/cuenta.repository';
import { nuevaCuentaSchema, type NuevaCuentaInput } from '@/domain/schemas/perfil.schema';
import { fail, ok, type Result } from '@/domain/shared/result';

import { errorValidacion, type ErrorCasoDeUso } from '../errores';
import type { SesionActual } from '../ports/sesion.port';
import { aViolaciones } from '../zod-violaciones';

export type CodigoErrorCrearCuenta = RechazoCrearCuenta | 'sin_sesion' | 'validacion';

const MENSAJES: Record<Exclude<CodigoErrorCrearCuenta, 'validacion'>, string> = {
  sin_sesion: 'Su sesión terminó. Ingrese de nuevo.',
  sin_permiso: 'Usted no puede crear cuentas de este tipo.',
  cedula_duplicada: 'Ya existe una cuenta con esta cédula.',
  correo_duplicado: 'Ya existe una cuenta con este correo.',
  recinto_no_valido: 'El recinto elegido no es válido.',
};

const error = (codigo: Exclude<CodigoErrorCrearCuenta, 'validacion'>): ErrorCasoDeUso<CodigoErrorCrearCuenta> => ({
  codigo,
  mensaje: MENSAJES[codigo],
});

export class CrearCuenta {
  constructor(
    private readonly deps: {
      readonly sesion: SesionActual;
      readonly coordinaciones: CoordinacionRecintoRepository;
      readonly cuentas: CuentaRepository;
    },
  ) {}

  async ejecutar(input: NuevaCuentaInput): Promise<Result<CuentaCreada, ErrorCasoDeUso<CodigoErrorCrearCuenta>>> {
    const { sesion, coordinaciones, cuentas } = this.deps;

    const actor = await sesion.perfilActual();
    if (!actor) return fail(error('sin_sesion'));
    if (!puedeOperar(actor)) return fail(error('sin_permiso'));

    const parse = nuevaCuentaSchema.safeParse(input);
    if (!parse.success) return fail(errorValidacion(aViolaciones(parse.error.issues)));
    const cuenta = parse.data;

    switch (actor.rol) {
      case 'coordinador_provincial':
        break; // Crea coordinadores de recinto y veedores; la jurisdicción la valida RLS.
      case 'coordinador_recinto': {
        if (cuenta.rol !== 'veedor') return fail(error('sin_permiso'));
        const coordinacion = await coordinaciones.obtenerVigentePorRecinto(cuenta.recintoId);
        if (coordinacion?.coordinadorId !== actor.id) return fail(error('sin_permiso'));
        break;
      }
      case 'veedor':
        return fail(error('sin_permiso'));
    }

    const creada = await cuentas.crear(cuenta);
    return creada.ok ? ok(creada.value) : fail(error(creada.error));
  }
}
