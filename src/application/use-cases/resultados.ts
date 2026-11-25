// Fase 7 — Seguimiento y revisión (RF-17, ADR-17, ADR-13).
// - Tablero: solo el coordinador provincial (RF-17).
// - Resultados de un recinto y detalle del acta: provincial y coordinador de recinto, cada uno
//   en su alcance (PROJECT_SPEC Fase 7). La RLS lo vuelve a exigir en el servidor (ADR-16).
import type { MesaConVeedor } from '@/domain/entities/mesa';
import { puedeOperar } from '@/domain/entities/perfil';
import {
  avanceGeneral,
  ordenarPorAvance,
  type ActaRecibida,
  type AvanceGeneral,
  type AvanceRecinto,
  type DetalleActa,
  type ResumenVotos,
  type TotalCandidatura,
} from '@/domain/entities/resultados';
import type { MesaRepository } from '@/domain/repositories/mesa.repository';
import type { ResultadosRepository } from '@/domain/repositories/resultados.repository';
import { fail, ok, type Result } from '@/domain/shared/result';
import { DIGNIDADES, type Dignidad } from '@/domain/value-objects/dignidad';
import type { Rol } from '@/domain/value-objects/rol';

import type { ErrorCasoDeUso } from '../errores';
import type { FotosActaRemotas } from '../ports/seguimiento.port';
import type { SesionActual } from '../ports/sesion.port';

export type CodigoErrorResultados = 'sin_sesion' | 'sin_permiso' | 'no_encontrada';

export const MENSAJES_RESULTADOS: Record<CodigoErrorResultados, string> = {
  sin_sesion: 'Su sesión terminó. Ingrese de nuevo.',
  sin_permiso: 'Esta información es solo para los coordinadores.',
  no_encontrada: 'No se encontró el acta, o no está dentro de su alcance.',
};

const error = (codigo: CodigoErrorResultados): ErrorCasoDeUso<CodigoErrorResultados> => ({ codigo, mensaje: MENSAJES_RESULTADOS[codigo] });
type Resultado<T> = Promise<Result<T, ErrorCasoDeUso<CodigoErrorResultados>>>;

async function exigirRol(sesion: SesionActual, roles: readonly Rol[]): Promise<ErrorCasoDeUso<CodigoErrorResultados> | null> {
  const actor = await sesion.perfilActual();
  if (!actor) return error('sin_sesion');
  return roles.includes(actor.rol) && puedeOperar(actor) ? null : error('sin_permiso');
}

const COORDINADORES: readonly Rol[] = ['coordinador_provincial', 'coordinador_recinto'];

export type Tablero = {
  readonly dignidad: Dignidad;
  readonly general: AvanceGeneral;
  /** Primero los recintos con menos avance. */
  readonly recintos: readonly AvanceRecinto[];
  readonly totales: readonly TotalCandidatura[];
  readonly resumen: ResumenVotos;
};

/** Tablero del coordinador provincial (RF-17): avance por recinto y votos por candidato en total. */
export class ConsultarTablero {
  constructor(private readonly deps: { sesion: SesionActual; resultados: ResultadosRepository }) {}

  async ejecutar(dignidad: Dignidad): Resultado<Tablero> {
    const sinPermiso = await exigirRol(this.deps.sesion, ['coordinador_provincial']);
    if (sinPermiso) return fail(sinPermiso);
    const { resultados } = this.deps;
    const [recintos, totales, resumen] = await Promise.all([
      resultados.avancePorRecinto(),
      resultados.totalesPorCandidato(dignidad),
      resultados.resumenVotos(dignidad),
    ]);
    return ok({ dignidad, general: avanceGeneral(recintos), recintos: ordenarPorAvance(recintos), totales, resumen });
  }
}

/** Estado de las dos actas de una mesa en el servidor. */
export type MesaConActas = MesaConVeedor & { readonly actas: Readonly<Record<Dignidad, ActaRecibida | null>> };

export type ResultadosRecinto = {
  readonly dignidad: Dignidad;
  readonly totales: readonly TotalCandidatura[];
  readonly resumen: ResumenVotos;
  readonly mesas: readonly MesaConActas[];
};

/** Votos de un recinto y el estado de las actas de cada mesa (provincial y coordinador de recinto). */
export class ConsultarResultadosRecinto {
  constructor(private readonly deps: { sesion: SesionActual; resultados: ResultadosRepository; mesas: MesaRepository }) {}

  async ejecutar(recintoId: string, dignidad: Dignidad): Resultado<ResultadosRecinto> {
    const sinPermiso = await exigirRol(this.deps.sesion, COORDINADORES);
    if (sinPermiso) return fail(sinPermiso);
    const { resultados, mesas } = this.deps;
    const [totales, resumen, listaMesas, actas] = await Promise.all([
      resultados.totalesPorCandidato(dignidad, recintoId),
      resultados.resumenVotos(dignidad, recintoId),
      mesas.listarPorRecinto(recintoId),
      resultados.actasDeRecinto(recintoId),
    ]);
    const conActas = listaMesas.map((m) => {
      const deMesa = actas.filter((a) => a.mesaId === m.id);
      const porDignidad = Object.fromEntries(
        DIGNIDADES.map((d) => [d, deMesa.find((a) => a.dignidad === d) ?? null]),
      ) as Record<Dignidad, ActaRecibida | null>;
      return { ...m, actas: porDignidad };
    });
    // Orden del CNE: por sexo y número (aquí no se priorizan las mesas sin veedor como en F7).
    conActas.sort((a, b) => a.sexo.localeCompare(b.sexo) || a.numero - b.numero);
    return ok({ dignidad, totales, resumen, mesas: conActas });
  }
}

export type ActaParaRevisar = DetalleActa & { readonly urlFoto: string | null };

/** Detalle del acta con su foto (URL firmada) para revisarla (RF-13, RF-17, ADR-13). */
export class VerDetalleActa {
  constructor(private readonly deps: { sesion: SesionActual; resultados: ResultadosRepository; fotos: FotosActaRemotas }) {}

  async ejecutar(actaId: string): Resultado<ActaParaRevisar> {
    const sinPermiso = await exigirRol(this.deps.sesion, COORDINADORES);
    if (sinPermiso) return fail(sinPermiso);
    const detalle = await this.deps.resultados.detalleActa(actaId);
    if (!detalle) return fail(error('no_encontrada'));
    // Si la foto no se puede firmar (p. ej. sin conexión), el detalle se muestra igual.
    const urlFoto = await this.deps.fotos.urlFirmada(detalle.fotoPath).catch(() => null);
    return ok({ ...detalle, urlFoto });
  }
}
