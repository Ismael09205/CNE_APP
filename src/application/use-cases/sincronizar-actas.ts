// F10 — Sincronización de la cola de actas (ADR-15, RNF-09, RNF-11).
// Paso 1: foto a la ruta fija. Paso 2: RPC que inserta acta + votos (solo INSERT).
// Decisiones: F6-5 (el servidor valida la vigencia en confirmada_en), F6-6 (foto huérfana).
import { esperaReintentoMs, type EnvioActa } from '@/domain/entities/envio-acta';
import type { ReporteErrores } from '../ports/reporte-errores.port';
import type { ActaOutboxRepository } from '@/domain/repositories/acta-outbox.repository';

import type { AlmacenFotosLocal } from '../ports/almacen-fotos.port';
import type { EstadoRed } from '../ports/red.port';
import type { Reloj } from '../ports/reloj.port';
import { FallaRed, SesionVencida, type RespuestaRegistro, type ServidorActas } from '../ports/servidor-actas.port';
import type { SesionActual } from '../ports/sesion.port';

export type ResultadoSincronizacion = {
  readonly enviadas: number;
  readonly conflictos: number;
  readonly rechazadas: number;
  readonly pendientes: number;
  /** Por qué se detuvo antes de terminar (si se detuvo). */
  readonly detenida?: 'sin_conexion' | 'sin_sesion';
};

const VACIO: ResultadoSincronizacion = { enviadas: 0, conflictos: 0, rechazadas: 0, pendientes: 0 };

export class SincronizarActas {
  private enCurso: Promise<ResultadoSincronizacion> | null = null;

  constructor(
    private readonly deps: {
      readonly sesion: SesionActual;
      readonly outbox: ActaOutboxRepository;
      readonly servidor: Pick<ServidorActas, 'subirFoto' | 'registrar'>;
      readonly fotos: AlmacenFotosLocal;
      readonly red: Pick<EstadoRed, 'hayConexion'>;
      readonly reloj: Reloj;
      /** ADR-18: errores inesperados al enviar (p. ej. una foto que no sube). */
      readonly reporte?: ReporteErrores;
    },
  ) {}

  /**
   * Envía las actas pendientes del veedor. Nunca corre dos veces a la vez.
   * `forzar` ignora la espera entre reintentos (al volver la conexión o al pedirlo el usuario).
   */
  ejecutar(opciones: { readonly forzar?: boolean } = {}): Promise<ResultadoSincronizacion> {
    this.enCurso ??= this.recorrer(opciones.forzar ?? false).finally(() => {
      this.enCurso = null;
    });
    return this.enCurso;
  }

  private async recorrer(forzar: boolean): Promise<ResultadoSincronizacion> {
    const { sesion, outbox, red, reloj } = this.deps;
    const perfil = await sesion.perfilActual().catch(() => null);
    if (!perfil) return { ...VACIO, detenida: 'sin_sesion' };

    const envios = await outbox.listarPorEnviar(perfil.id);
    if (envios.length === 0) return VACIO;
    if (!(await red.hayConexion())) return { ...VACIO, pendientes: envios.length, detenida: 'sin_conexion' };

    const r = { enviadas: 0, conflictos: 0, rechazadas: 0, pendientes: 0 };
    for (const envio of envios) {
      const vence = envio.actualizadoEn.getTime() + esperaReintentoMs(envio.intentos);
      if (!forzar && envio.intentos > 0 && vence > reloj.ahora().getTime()) {
        r.pendientes++;
        continue;
      }
      try {
        const estado = await this.enviar(envio);
        if (estado === 'guardada') r.enviadas++;
        else if (estado === 'conflicto') r.conflictos++;
        else if (estado === 'pendiente') r.pendientes++;
        else r.rechazadas++;
      } catch (e) {
        if (e instanceof SesionVencida) {
          await outbox.marcar(envio.acta.id, 'pendiente', { error: 'sin_sesion' });
          return { ...r, pendientes: r.pendientes + 1, detenida: 'sin_sesion' };
        }
        const codigo = e instanceof FallaRed ? 'sin_conexion' : 'error_inesperado';
        if (codigo === 'error_inesperado') {
          this.deps.reporte?.capturar(e, { operacion: 'sincronizar_acta', datos: { dignidad: envio.acta.dignidad, intentos: envio.intentos } });
        }
        await outbox.marcar(envio.acta.id, 'pendiente', { error: codigo, contarIntento: true });
        r.pendientes++;
        if (e instanceof FallaRed) {
          // Se cortó la red: el resto también fallaría. Se retoma al volver la conexión.
          return { ...r, pendientes: r.pendientes + (envios.length - envios.indexOf(envio) - 1), detenida: 'sin_conexion' };
        }
      }
    }
    return r;
  }

  private async enviar(envio: EnvioActa): Promise<'guardada' | 'conflicto' | 'error' | 'pendiente'> {
    const { outbox, servidor, fotos } = this.deps;
    const { acta } = envio;
    await outbox.marcar(acta.id, 'enviando');

    const foto = await servidor.subirFoto(acta, { reemplazar: false });
    let respuesta: RespuestaRegistro = await servidor.registrar(acta);

    // F6-6: había una foto huérfana de otro veedor en la ruta. El veedor vigente puede reemplazarla.
    if (respuesta.tipo === 'rechazada' && respuesta.motivo === 'foto_faltante' && foto === 'ya_existe') {
      if ((await servidor.subirFoto(acta, { reemplazar: true })) === 'subida') respuesta = await servidor.registrar(acta);
    }

    switch (respuesta.tipo) {
      case 'guardada':
      case 'ya_guardada':
        await outbox.marcar(acta.id, 'guardada', { error: null });
        // F6-3: la foto ya está en el servidor; se borra del teléfono.
        await fotos.eliminar(acta.evidencia.fotoPath).catch(() => undefined);
        return 'guardada';
      case 'conflicto':
        // Nunca se sobrescribe (ADR-15). La foto local se conserva como respaldo.
        await outbox.marcar(acta.id, 'conflicto', { error: 'conflicto' });
        return 'conflicto';
      case 'rechazada':
        if (respuesta.motivo === 'hora_invalida') {
          // F6-7: el reloj del teléfono iba adelantado. Cuando la hora del servidor alcance a
          // confirmada_en el acta será aceptada: se reintenta con espera, sin modificar el acta.
          await outbox.marcar(acta.id, 'pendiente', { error: 'hora_invalida', contarIntento: true });
          return 'pendiente';
        }
        await outbox.marcar(acta.id, 'error', { error: respuesta.motivo });
        return 'error';
    }
  }
}
