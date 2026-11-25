// F9 — Registro de acta offline-first (ADR-12, ADR-13, ADR-14, ADR-15).
import { confirmarActa, validarEvidencia } from '@/domain/entities/acta';
import { puedeOperar } from '@/domain/entities/perfil';
import type { ActaOutboxRepository } from '@/domain/repositories/acta-outbox.repository';
import type { AsignacionMesaRepository } from '@/domain/repositories/asignacion-mesa.repository';
import type { MesaRepository } from '@/domain/repositories/mesa.repository';
import type { CandidaturaRepository } from '@/domain/repositories/candidatura.repository';
import type { ResultadosActaInput } from '@/domain/rules/acta.rules';
import { crearActaSchema } from '@/domain/schemas/acta.schema';
import { fail, ok, type Result } from '@/domain/shared/result';
import { esDignidad, type Dignidad } from '@/domain/value-objects/dignidad';
import type { EstadoEnvio } from '@/domain/value-objects/estado-envio';

import { errorValidacion, type ErrorCasoDeUso } from '../errores';
import type { AlmacenFotosLocal } from '../ports/almacen-fotos.port';
import type { GeneradorId } from '../ports/generador-id.port';
import type { ServidorActas } from '../ports/servidor-actas.port';
import type { Reloj } from '../ports/reloj.port';
import type { SesionActual } from '../ports/sesion.port';
import { aViolaciones } from '../zod-violaciones';

export type RegistrarActaInput = {
  readonly mesaId: string;
  readonly dignidad: Dignidad;
  readonly resultados: ResultadosActaInput;
  readonly evidencia: {
    readonly fotoUriTemporal: string;
    readonly lat: number;
    readonly lng: number;
    readonly precisionM: number;
    readonly ubicacionSimulada: boolean;
    readonly capturadaEn: Date;
  };
};

export type RegistrarActaOutput = { readonly actaId: string; readonly estadoEnvio: EstadoEnvio };

export type CodigoErrorRegistrarActa =
  | 'sin_sesion'
  | 'no_autorizado'
  | 'dignidad_invalida'
  | 'mesa_no_asignada'
  | 'mesa_no_encontrada'
  | 'acta_ya_registrada'
  | 'validacion';

const MENSAJES: Record<Exclude<CodigoErrorRegistrarActa, 'validacion'>, string> = {
  sin_sesion: 'Su sesión terminó. Ingrese de nuevo.',
  no_autorizado: 'Solo el veedor de la mesa puede registrar sus actas.',
  dignidad_invalida: 'Elija si el acta es de alcaldía o de prefectura.',
  mesa_no_asignada: 'Esta mesa no está asignada a usted.',
  mesa_no_encontrada: 'No se encontró la mesa. Actualice la lista de mesas.',
  acta_ya_registrada: 'El acta de esta dignidad ya fue registrada en esta mesa y no se puede cambiar.',
};

const error = (codigo: Exclude<CodigoErrorRegistrarActa, 'validacion'>): ErrorCasoDeUso<CodigoErrorRegistrarActa> => ({
  codigo,
  mensaje: MENSAJES[codigo],
});

export class RegistrarActa {
  constructor(
    private readonly deps: {
      readonly sesion: SesionActual;
      readonly asignaciones: Pick<AsignacionMesaRepository, 'obtenerVigentePorVeedor'>;
      readonly mesas: Pick<MesaRepository, 'obtenerPorId'>;
      readonly candidaturas: CandidaturaRepository;
      readonly outbox: ActaOutboxRepository;
      readonly fotos: AlmacenFotosLocal;
      readonly ids: GeneradorId;
      readonly reloj: Reloj;
      /** Con conexión, evita registrar un acta que ya existe en el servidor (p. ej. la del veedor anterior). */
      readonly servidor?: Pick<ServidorActas, 'dignidadesRegistradas'>;
    },
  ) {}

  async ejecutar(input: RegistrarActaInput): Promise<Result<RegistrarActaOutput, ErrorCasoDeUso<CodigoErrorRegistrarActa>>> {
    const { sesion, asignaciones, mesas, candidaturas, outbox, fotos, ids, reloj, servidor } = this.deps;

    // 1. Quién registra: veedor habilitado con la mesa asignada (RF-16, S-04).
    const perfil = await sesion.perfilActual();
    if (!perfil) return fail(error('sin_sesion'));
    if (perfil.rol !== 'veedor' || !puedeOperar(perfil)) return fail(error('no_autorizado'));
    if (!esDignidad(input.dignidad)) return fail(error('dignidad_invalida'));

    const asignacion = await asignaciones.obtenerVigentePorVeedor(perfil.id);
    if (!asignacion || asignacion.mesaId !== input.mesaId) return fail(error('mesa_no_asignada'));

    const mesa = await mesas.obtenerPorId(input.mesaId);
    if (!mesa) return fail(error('mesa_no_encontrada'));

    // 2. Una sola acta por (mesa, dignidad), también sin conexión (ADR-11, S-08).
    if (await outbox.existeParaMesaYDignidad(input.mesaId, input.dignidad)) return fail(error('acta_ya_registrada'));
    if (servidor) {
      // Sin conexión no se puede consultar: el servidor lo resolverá al sincronizar (conflicto).
      const registradas = await servidor.dignidadesRegistradas(input.mesaId).catch(() => [] as Dignidad[]);
      if (registradas.includes(input.dignidad)) return fail(error('acta_ya_registrada'));
    }

    // 3. Mismo esquema que el formulario (ADR-12) + evidencia obligatoria (RF-13).
    const opciones = {
      candidaturaIds: (await candidaturas.listarParaMesa(mesa.id, input.dignidad)).map((c) => c.id),
      maxSufragantes: mesa.numeroElectores,
    };
    const parse = crearActaSchema(opciones).safeParse(input.resultados);
    const violaciones = [
      ...(parse.success ? [] : aViolaciones(parse.error.issues)),
      ...validarEvidencia({ ...input.evidencia, fotoPath: input.evidencia.fotoUriTemporal }),
    ];
    if (violaciones.length > 0) return fail(errorValidacion(violaciones));

    // 4. Foto al directorio de documentos y acta definitiva en la outbox.
    const actaId = ids.uuid();
    const { fotoUriTemporal, ...ubicacion } = input.evidencia;
    const fotoPath = await fotos.persistir(fotoUriTemporal, actaId);

    try {
      const acta = confirmarActa(
        {
          ...input.resultados,
          id: actaId,
          mesaId: input.mesaId,
          dignidad: input.dignidad,
          veedorId: perfil.id,
          confirmadaEn: reloj.ahora(),
          evidencia: { ...ubicacion, fotoPath },
        },
        opciones,
      );
      if (!acta.ok) {
        await fotos.eliminar(fotoPath);
        return fail(errorValidacion(acta.error));
      }
      await outbox.guardarYEncolar(acta.value);
    } catch (e) {
      await fotos.eliminar(fotoPath).catch(() => undefined);
      throw e;
    }

    return ok({ actaId, estadoEnvio: 'pendiente' });
  }
}
