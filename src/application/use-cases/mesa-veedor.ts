// F9/F10 — Lo que ve el veedor: su mesa, las listas de cada dignidad y el estado de cada acta.
// Funciona sin conexión: los repositorios responden desde la caché local (ADR-15).
import type { Candidatura } from '@/domain/entities/candidatura';
import type { Mesa } from '@/domain/entities/mesa';
import { puedeOperar } from '@/domain/entities/perfil';
import type { ActaOutboxRepository } from '@/domain/repositories/acta-outbox.repository';
import type { AsignacionMesaRepository } from '@/domain/repositories/asignacion-mesa.repository';
import type { CandidaturaRepository } from '@/domain/repositories/candidatura.repository';
import type { MesaRepository } from '@/domain/repositories/mesa.repository';
import { requiereRevisionActa } from '@/domain/rules/evidencia.rules';
import { fail, ok, type Result } from '@/domain/shared/result';
import { DIGNIDADES, type Dignidad } from '@/domain/value-objects/dignidad';
import type { EstadoEnvio } from '@/domain/value-objects/estado-envio';

import type { ErrorCasoDeUso } from '../errores';
import type { ServidorActas } from '../ports/servidor-actas.port';
import type { SesionActual } from '../ports/sesion.port';

export type EstadoActaMesa = {
  readonly dignidad: Dignidad;
  /** `sin_registrar`: se puede registrar. `registrada`: ya existe en el servidor (de este u otro veedor). */
  readonly estado: 'sin_registrar' | 'registrada' | EstadoEnvio;
  readonly actaId: string | null;
  readonly ultimoError: string | null;
  readonly requiereRevision: boolean;
};

export type MesaDelVeedor = {
  readonly mesa: Mesa;
  readonly candidaturas: Readonly<Record<Dignidad, readonly Candidatura[]>>;
  readonly actas: readonly EstadoActaMesa[];
};

export type CodigoErrorMesaVeedor = 'sin_sesion' | 'no_autorizado' | 'sin_mesa' | 'mesa_no_encontrada';

const MENSAJES: Record<CodigoErrorMesaVeedor, string> = {
  sin_sesion: 'Su sesión terminó. Ingrese de nuevo.',
  no_autorizado: 'Esta sección es solo para veedores.',
  sin_mesa: 'Todavía no tiene una mesa asignada. Consulte con el coordinador de su recinto.',
  mesa_no_encontrada: 'No se encontró su mesa. Conéctese a internet para actualizar los datos.',
};

const error = (codigo: CodigoErrorMesaVeedor): ErrorCasoDeUso<CodigoErrorMesaVeedor> => ({ codigo, mensaje: MENSAJES[codigo] });

export class ConsultarMesaDelVeedor {
  constructor(
    private readonly deps: {
      readonly sesion: SesionActual;
      readonly asignaciones: Pick<AsignacionMesaRepository, 'obtenerVigentePorVeedor'>;
      readonly mesas: Pick<MesaRepository, 'obtenerPorId'>;
      readonly candidaturas: CandidaturaRepository;
      readonly outbox: Pick<ActaOutboxRepository, 'listarPorMesa'>;
      readonly servidor?: Pick<ServidorActas, 'dignidadesRegistradas'>;
    },
  ) {}

  async ejecutar(): Promise<Result<MesaDelVeedor, ErrorCasoDeUso<CodigoErrorMesaVeedor>>> {
    const { sesion, asignaciones, mesas, candidaturas, outbox, servidor } = this.deps;
    const perfil = await sesion.perfilActual();
    if (!perfil) return fail(error('sin_sesion'));
    if (perfil.rol !== 'veedor' || !puedeOperar(perfil)) return fail(error('no_autorizado'));

    const asignacion = await asignaciones.obtenerVigentePorVeedor(perfil.id);
    if (!asignacion) return fail(error('sin_mesa'));
    const mesa = await mesas.obtenerPorId(asignacion.mesaId);
    if (!mesa) return fail(error('mesa_no_encontrada'));

    const [alcaldia, prefectura, locales, remotas] = await Promise.all([
      candidaturas.listarParaMesa(mesa.id, 'alcaldia'),
      candidaturas.listarParaMesa(mesa.id, 'prefectura'),
      outbox.listarPorMesa(mesa.id),
      servidor ? servidor.dignidadesRegistradas(mesa.id).catch(() => [] as Dignidad[]) : Promise.resolve([] as Dignidad[]),
    ]);

    const actas = DIGNIDADES.map((dignidad): EstadoActaMesa => {
      const local = locales.find((e) => e.acta.dignidad === dignidad);
      if (local) {
        return {
          dignidad,
          estado: local.estado,
          actaId: local.acta.id,
          ultimoError: local.ultimoError,
          requiereRevision: requiereRevisionActa(local.acta.evidencia),
        };
      }
      return {
        dignidad,
        estado: remotas.includes(dignidad) ? 'registrada' : 'sin_registrar',
        actaId: null,
        ultimoError: null,
        requiereRevision: false,
      };
    });

    return ok({ mesa, candidaturas: { alcaldia, prefectura }, actas });
  }
}
