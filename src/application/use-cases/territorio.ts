// Fase 5 — Gestión territorial: F5 (recintos y mesas), F6 (coordinación), F7 (asignación).
// Los servidores (RLS y RPC) repiten todas las validaciones; aquí se dan mensajes claros
// y se evita llamar cuando es obvio que no procede.
import { ordenarMesas, type MesaConVeedor } from '@/domain/entities/mesa';
import type { Parroquia } from '@/domain/entities/parroquia';
import { puedeOperar, type Perfil } from '@/domain/entities/perfil';
import type { Recinto } from '@/domain/entities/recinto';
import type { VeedorDelRecinto } from '@/domain/entities/veedor-recinto';
import type { AsignacionMesaRepository, RechazoAsignacion } from '@/domain/repositories/asignacion-mesa.repository';
import type {
  CoordinacionRecintoRepository,
  CoordinacionVigente,
  RechazoCoordinacion,
} from '@/domain/repositories/coordinacion-recinto.repository';
import type { MesaRepository } from '@/domain/repositories/mesa.repository';
import type { PerfilRepository } from '@/domain/repositories/perfil.repository';
import type { RechazoRecinto, RecintoRepository } from '@/domain/repositories/recinto.repository';
import type { VeedorRecintoRepository } from '@/domain/repositories/veedor-recinto.repository';
import {
  nuevoRecintoSchema,
  rangoMesasSchema,
  ubicacionGpsSchema,
  type NuevoRecintoInput,
  type RangoMesasInput,
} from '@/domain/schemas/territorio.schema';
import { fail, ok, type Result } from '@/domain/shared/result';
import type { Rol } from '@/domain/value-objects/rol';

import { errorValidacion, type ErrorCasoDeUso } from '../errores';
import type { SesionActual } from '../ports/sesion.port';
import type { FalloGps, LecturaGps, UbicacionGateway } from '../ports/ubicacion.port';
import { aViolaciones } from '../zod-violaciones';

export type CodigoErrorTerritorio =
  | FalloGps
  | RechazoRecinto
  | RechazoCoordinacion
  | RechazoAsignacion
  | 'mesas_existentes'
  | 'rango_invalido'
  | 'sin_sesion'
  | 'validacion';

export const MENSAJES_TERRITORIO_APP: Record<Exclude<CodigoErrorTerritorio, 'validacion' | 'mesas_existentes'>, string> = {
  permiso_denegado: 'La app necesita permiso de ubicación. Actívelo en los ajustes del teléfono.',
  gps_apagado: 'El GPS está apagado. Enciéndalo e intente de nuevo.',
  no_disponible: 'No se pudo obtener la ubicación. Salga a un lugar abierto e intente de nuevo.',
  codigo_duplicado: 'Ya existe un recinto con ese código.',
  sin_permiso: 'Usted no tiene permiso para esta acción.',
  rango_invalido: 'El rango de juntas no es válido.',
  coordinador_no_valido: 'La persona elegida no es un coordinador de recinto con cuenta activa.',
  ya_asignado: 'Esa persona ya coordina este recinto.',
  coordinador_con_recinto: 'Esa persona ya coordina otro recinto.',
  no_es_coordinador_vigente: 'Usted ya no es el coordinador de este recinto.',
  veedor_no_valido: 'La persona elegida no es un veedor con cuenta activa.',
  veedor_de_otro_recinto: 'Solo puede elegir veedores registrados en este recinto.',
  veedor_con_otra_mesa: 'Ese veedor ya está a cargo de otra mesa.',
  mesa_con_veedor: 'Esta mesa ya tiene veedor. Use la opción Reemplazar.',
  reemplazo_concurrente: 'Otra persona cambió esta mesa al mismo tiempo. Actualice e intente de nuevo.',
  sin_sesion: 'Su sesión terminó. Ingrese de nuevo.',
};

type Codigo = Exclude<CodigoErrorTerritorio, 'validacion' | 'mesas_existentes'>;
const error = (codigo: Codigo): ErrorCasoDeUso<CodigoErrorTerritorio> => ({ codigo, mensaje: MENSAJES_TERRITORIO_APP[codigo] });
type Resultado<T> = Promise<Result<T, ErrorCasoDeUso<CodigoErrorTerritorio>>>;

async function actorCon(sesion: SesionActual, rol: Rol): Promise<Perfil | ErrorCasoDeUso<CodigoErrorTerritorio>> {
  const actor = await sesion.perfilActual();
  if (!actor) return error('sin_sesion');
  if (actor.rol !== rol || !puedeOperar(actor)) return error('sin_permiso');
  return actor;
}
const esError = (x: unknown): x is ErrorCasoDeUso<CodigoErrorTerritorio> => !!x && typeof x === 'object' && 'codigo' in x;

// ---------------------------------------------------------------------------
// F5 — Recintos
// ---------------------------------------------------------------------------

/** Lee el GPS y verifica precisión (≤ 50 m) y que no sea simulada (D-30, D-31). */
export class TomarUbicacionRecinto {
  constructor(private readonly deps: { ubicacion: UbicacionGateway }) {}

  async ejecutar(): Resultado<LecturaGps> {
    const lectura = await this.deps.ubicacion.leerUbicacionActual();
    if (!lectura.ok) return fail(error(lectura.error));
    const parse = ubicacionGpsSchema.safeParse(lectura.value);
    return parse.success ? ok(lectura.value) : fail(errorValidacion(aViolaciones(parse.error.issues)));
  }
}

export class CrearRecinto {
  constructor(private readonly deps: { sesion: SesionActual; recintos: RecintoRepository }) {}

  async ejecutar(input: NuevoRecintoInput): Resultado<Recinto> {
    const actor = await actorCon(this.deps.sesion, 'coordinador_provincial');
    if (esError(actor)) return fail(actor);
    const parse = nuevoRecintoSchema.safeParse(input);
    if (!parse.success) return fail(errorValidacion(aViolaciones(parse.error.issues)));
    const r = await this.deps.recintos.crear(parse.data, actor.id);
    return r.ok ? ok(r.value) : fail(error(r.error));
  }
}

export class ListarParroquias {
  constructor(private readonly deps: { recintos: RecintoRepository }) {}

  async ejecutar(): Promise<Parroquia[]> {
    return [...(await this.deps.recintos.listarParroquias())].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }
}

// ---------------------------------------------------------------------------
// F5 — Mesas por rango (D-32)
// ---------------------------------------------------------------------------
export class AgregarMesas {
  constructor(private readonly deps: { sesion: SesionActual; mesas: MesaRepository }) {}

  async ejecutar(recintoId: string, input: RangoMesasInput): Resultado<{ readonly creadas: number }> {
    const actor = await actorCon(this.deps.sesion, 'coordinador_provincial');
    if (esError(actor)) return fail(actor);
    const parse = rangoMesasSchema.safeParse(input);
    if (!parse.success) return fail(errorValidacion(aViolaciones(parse.error.issues)));
    const r = await this.deps.mesas.agregarRango(recintoId, parse.data);
    if (r.ok) return ok({ creadas: r.value });
    if (r.error.codigo === 'mesas_existentes') {
      return fail({ codigo: 'mesas_existentes', mensaje: `Ya existen las juntas ${r.error.existentes}. Elija otro rango.` });
    }
    return fail(error(r.error.codigo));
  }
}

export class ListarMesasDeRecinto {
  constructor(private readonly deps: { mesas: MesaRepository }) {}

  async ejecutar(recintoId: string): Promise<MesaConVeedor[]> {
    return ordenarMesas(await this.deps.mesas.listarPorRecinto(recintoId));
  }
}

// ---------------------------------------------------------------------------
// F6 — Coordinación de recinto (ADR-08)
// ---------------------------------------------------------------------------
export type CoordinadorDisponible = Perfil & { readonly recintoId: string | null };

export class ListarCoordinaciones {
  constructor(private readonly deps: { coordinaciones: CoordinacionRecintoRepository }) {}

  ejecutar(): Promise<CoordinacionVigente[]> {
    return this.deps.coordinaciones.listarVigentes();
  }
}

/** Coordinadores de recinto visibles para el provincial, con su recinto vigente (o null). */
export class ListarCoordinadores {
  constructor(private readonly deps: { perfiles: PerfilRepository; coordinaciones: CoordinacionRecintoRepository }) {}

  async ejecutar(): Promise<CoordinadorDisponible[]> {
    const [personas, vigentes] = await Promise.all([this.deps.perfiles.listarVisibles(), this.deps.coordinaciones.listarVigentes()]);
    const recintoDe = new Map(vigentes.map((v) => [v.coordinador.id, v.recintoId]));
    return personas
      .filter((p) => p.rol === 'coordinador_recinto' && p.activo)
      .map((p) => ({ ...p, recintoId: recintoDe.get(p.id) ?? null }))
      .sort((a, b) => Number(!!a.recintoId) - Number(!!b.recintoId) || a.apellidos.localeCompare(b.apellidos, 'es'));
  }
}

export class AsignarCoordinador {
  constructor(private readonly deps: { sesion: SesionActual; coordinaciones: CoordinacionRecintoRepository }) {}

  async ejecutar(recintoId: string, coordinadorId: string): Resultado<void> {
    const actor = await actorCon(this.deps.sesion, 'coordinador_provincial');
    if (esError(actor)) return fail(actor);
    const r = await this.deps.coordinaciones.asignar(recintoId, coordinadorId);
    return r.ok ? ok(undefined) : fail(error(r.error));
  }
}

// ---------------------------------------------------------------------------
// F7 — Asignación de veedor (ADR-09, D-33)
// ---------------------------------------------------------------------------
export class ListarVeedoresDeRecinto {
  constructor(private readonly deps: { veedoresRecinto: VeedorRecintoRepository }) {}

  async ejecutar(recintoId: string): Promise<VeedorDelRecinto[]> {
    const veedores = await this.deps.veedoresRecinto.listarPorRecinto(recintoId);
    return [...veedores].sort((a, b) => Number(!!a.mesaId) - Number(!!b.mesaId) || a.apellidos.localeCompare(b.apellidos, 'es'));
  }
}

export class AsignarVeedor {
  constructor(private readonly deps: { sesion: SesionActual; asignaciones: AsignacionMesaRepository }) {}

  async ejecutar(mesa: Pick<MesaConVeedor, 'id' | 'veedor'>, veedorId: string): Resultado<void> {
    const actor = await actorCon(this.deps.sesion, 'coordinador_recinto');
    if (esError(actor)) return fail(actor);
    if (mesa.veedor) return fail(error('mesa_con_veedor'));
    const r = await this.deps.asignaciones.asignarVeedor(mesa.id, veedorId);
    return r.ok ? ok(undefined) : fail(error(r.error));
  }
}
