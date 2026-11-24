// F8 — Reemplazo inmediato de un veedor ausente (RF-10, S-04, S-06, ADR-10).
// Estas validaciones dan mensajes claros antes de llamar al servidor; la RPC
// `reemplazar_veedor` las repite dentro de una transacción con FOR UPDATE.
import type { AsignacionMesa } from '@/domain/entities/asignacion-mesa';
import { puedeOperar } from '@/domain/entities/perfil';
import type { AsignacionMesaRepository, RechazoReemplazo } from '@/domain/repositories/asignacion-mesa.repository';
import type { CoordinacionRecintoRepository } from '@/domain/repositories/coordinacion-recinto.repository';
import type { MesaRepository } from '@/domain/repositories/mesa.repository';
import type { PerfilRepository } from '@/domain/repositories/perfil.repository';
import type { VeedorRecintoRepository } from '@/domain/repositories/veedor-recinto.repository';
import { fail, ok, type Result } from '@/domain/shared/result';

import type { ErrorCasoDeUso } from '../errores';
import type { SesionActual } from '../ports/sesion.port';

export type ReemplazarVeedorInput = { readonly mesaId: string; readonly nuevoVeedorId: string };

export type CodigoErrorReemplazo =
  | RechazoReemplazo
  | 'sin_sesion'
  | 'no_autorizado'
  | 'mesa_no_encontrada'
  | 'mismo_veedor';

const MENSAJES: Record<CodigoErrorReemplazo, string> = {
  sin_sesion: 'Su sesión terminó. Ingrese de nuevo.',
  no_autorizado: 'Solo el coordinador del recinto puede reemplazar veedores.',
  no_es_coordinador_vigente: 'Usted ya no es el coordinador de este recinto.',
  mesa_no_encontrada: 'No se encontró la mesa.',
  mesa_sin_veedor: 'Esta mesa no tiene veedor. Use la opción Asignar veedor.',
  mismo_veedor: 'Elija un veedor diferente al actual.',
  veedor_no_valido: 'La persona elegida no es un veedor con cuenta activa.',
  veedor_de_otro_recinto: 'Solo puede elegir veedores registrados en este recinto.',
  veedor_con_otra_mesa: 'Ese veedor ya está a cargo de otra mesa.',
  reemplazo_concurrente: 'Otra persona cambió esta mesa al mismo tiempo. Actualice e intente de nuevo.',
};

const error = (codigo: CodigoErrorReemplazo): ErrorCasoDeUso<CodigoErrorReemplazo> => ({
  codigo,
  mensaje: MENSAJES[codigo],
});

export class ReemplazarVeedor {
  constructor(
    private readonly deps: {
      readonly sesion: SesionActual;
      readonly mesas: MesaRepository;
      readonly perfiles: PerfilRepository;
      readonly coordinaciones: CoordinacionRecintoRepository;
      readonly veedoresRecinto: VeedorRecintoRepository;
      readonly asignaciones: AsignacionMesaRepository;
    },
  ) {}

  async ejecutar(input: ReemplazarVeedorInput): Promise<Result<AsignacionMesa, ErrorCasoDeUso<CodigoErrorReemplazo>>> {
    const { sesion, mesas, perfiles, coordinaciones, veedoresRecinto, asignaciones } = this.deps;

    const actor = await sesion.perfilActual();
    if (!actor) return fail(error('sin_sesion'));
    if (actor.rol !== 'coordinador_recinto' || !puedeOperar(actor)) return fail(error('no_autorizado'));

    const mesa = await mesas.obtenerPorId(input.mesaId);
    if (!mesa) return fail(error('mesa_no_encontrada'));

    const coordinacion = await coordinaciones.obtenerVigentePorRecinto(mesa.recintoId);
    if (coordinacion?.coordinadorId !== actor.id) return fail(error('no_es_coordinador_vigente'));

    const actual = await asignaciones.obtenerVigentePorMesa(mesa.id);
    if (!actual) return fail(error('mesa_sin_veedor'));
    if (actual.veedorId === input.nuevoVeedorId) return fail(error('mismo_veedor'));

    const nuevo = await perfiles.obtenerPorId(input.nuevoVeedorId);
    if (!nuevo || nuevo.rol !== 'veedor' || !nuevo.activo) return fail(error('veedor_no_valido'));

    // S-06: solo veedores ya registrados en el mismo recinto.
    const membresia = await veedoresRecinto.obtenerVigentePorVeedor(nuevo.id);
    if (membresia?.recintoId !== mesa.recintoId) return fail(error('veedor_de_otro_recinto'));

    // S-04: una sola mesa vigente por veedor.
    if (await asignaciones.obtenerVigentePorVeedor(nuevo.id)) return fail(error('veedor_con_otra_mesa'));

    const resultado = await asignaciones.reemplazarVeedor(mesa.id, nuevo.id);
    return resultado.ok ? ok(resultado.value) : fail(error(resultado.error));
  }
}
