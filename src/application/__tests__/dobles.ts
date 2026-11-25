// Dobles en memoria de los puertos: permiten probar los casos de uso sin Supabase, SQLite ni cámara.
import type { Acta } from '@/domain/entities/acta';
import type { AsignacionMesa } from '@/domain/entities/asignacion-mesa';
import type { CoordinacionRecinto } from '@/domain/entities/coordinacion-recinto';
import type { Candidatura } from '@/domain/entities/candidatura';
import type { Mesa } from '@/domain/entities/mesa';
import type { Perfil } from '@/domain/entities/perfil';
import type { VeedorRecinto } from '@/domain/entities/veedor-recinto';
import { ESTADOS_REINTENTABLES, type EnvioActa } from '@/domain/entities/envio-acta';
import type { EstadoEnvio } from '@/domain/value-objects/estado-envio';
import type { ActaOutboxRepository } from '@/domain/repositories/acta-outbox.repository';
import type { AsignacionMesaRepository, RechazoAsignacion, RechazoReemplazo } from '@/domain/repositories/asignacion-mesa.repository';
import type { CandidaturaRepository } from '@/domain/repositories/candidatura.repository';
import type { CoordinacionRecintoRepository } from '@/domain/repositories/coordinacion-recinto.repository';
import type { CuentaCreada, CuentaRepository, RechazoCrearCuenta } from '@/domain/repositories/cuenta.repository';
import type { MesaRepository } from '@/domain/repositories/mesa.repository';
import type { PerfilRepository } from '@/domain/repositories/perfil.repository';
import type { VeedorRecintoRepository } from '@/domain/repositories/veedor-recinto.repository';
import type { NuevaCuenta } from '@/domain/schemas/perfil.schema';
import { fail, ok, type Result } from '@/domain/shared/result';
import type { Dignidad } from '@/domain/value-objects/dignidad';

import type { AlmacenFotosLocal } from '../ports/almacen-fotos.port';
import type { SesionActual } from '../ports/sesion.port';

export const perfil = (cambios: Partial<Perfil> = {}): Perfil => ({
  id: 'p1',
  cedula: '1003123450',
  nombres: 'Ana',
  apellidos: 'Pérez',
  telefono: '0991234567',
  correo: 'ana@correo.ec',
  rol: 'veedor',
  activo: true,
  debeCambiarClave: false,
  correoVerificado: true,
  ...cambios,
});

export const vigencia = { desde: new Date('2027-01-01'), hasta: null };

const candidatura = (dignidad: Dignidad, lista: string): Candidatura => ({
  id: `${dignidad}-${lista}`,
  dignidad,
  provinciaId: 10,
  cantonId: dignidad === 'alcaldia' ? 40 : null,
  lista,
  organizacionPolitica: `Lista ${lista}`,
  candidato: `Candidato ${lista}`,
  binomio: dignidad === 'prefectura' ? `Binomio ${lista}` : null,
  color: '#000000',
});

// Igual que el JSON real: 5 listas en alcaldía y 4 en prefectura.
export const CANDIDATURAS: Record<Dignidad, Candidatura[]> = {
  alcaldia: ['7', '8', '17', '20', '103-62'].map((l) => candidatura('alcaldia', l)),
  prefectura: ['7', '8', '62', '70-17'].map((l) => candidatura('prefectura', l)),
};

export class SesionFalsa implements SesionActual {
  constructor(public perfil: Perfil | null) {}
  async perfilActual() {
    return this.perfil;
  }
}

export class PerfilesEnMemoria implements PerfilRepository {
  constructor(public perfiles: Perfil[] = []) {}
  async obtenerPorId(id: string) {
    return this.perfiles.find((p) => p.id === id) ?? null;
  }
  async listarVisibles() {
    return this.perfiles;
  }
}

export class MesasEnMemoria implements MesaRepository {
  constructor(public mesas: Mesa[] = []) {}
  async obtenerPorId(id: string) {
    return this.mesas.find((m) => m.id === id) ?? null;
  }
  async listarPorRecinto(recintoId: string) {
    return this.mesas.filter((m) => m.recintoId === recintoId).map((m) => ({ ...m, veedor: null }));
  }
  async agregarRango() {
    return ok(0);
  }
}

export class CandidaturasEnMemoria implements CandidaturaRepository {
  async listarParaMesa(_mesaId: string, dignidad: Dignidad) {
    return CANDIDATURAS[dignidad];
  }
}

export class CoordinacionesEnMemoria implements CoordinacionRecintoRepository {
  constructor(public coordinaciones: CoordinacionRecinto[] = []) {}
  async obtenerVigentePorRecinto(recintoId: string) {
    return this.coordinaciones.find((c) => c.recintoId === recintoId && c.hasta === null) ?? null;
  }
  async listarVigentes() {
    return [];
  }
  async asignar() {
    return ok(undefined);
  }
}

export class VeedoresRecintoEnMemoria implements VeedorRecintoRepository {
  constructor(public membresias: VeedorRecinto[] = []) {}
  async obtenerVigentePorVeedor(veedorId: string) {
    return this.membresias.find((m) => m.veedorId === veedorId && m.hasta === null) ?? null;
  }
  async listarPorRecinto() {
    return [];
  }
}

export class AsignacionesEnMemoria implements AsignacionMesaRepository {
  public rechazoServidor: RechazoReemplazo | null = null;
  public llamadasReemplazo = 0;
  constructor(public asignaciones: AsignacionMesa[] = []) {}

  async obtenerVigentePorMesa(mesaId: string) {
    return this.asignaciones.find((a) => a.mesaId === mesaId && a.hasta === null) ?? null;
  }
  async obtenerVigentePorVeedor(veedorId: string) {
    return this.asignaciones.find((a) => a.veedorId === veedorId && a.hasta === null) ?? null;
  }
  public ultimoVeedorActual: string | null = null;
  async asignarVeedor(): Promise<Result<void, RechazoAsignacion>> {
    return ok(undefined);
  }
  async reemplazarVeedor(mesaId: string, veedorActualId: string, nuevoVeedorId: string): Promise<Result<void, RechazoReemplazo>> {
    this.llamadasReemplazo++;
    this.ultimoVeedorActual = veedorActualId;
    if (this.rechazoServidor) return fail(this.rechazoServidor);
    const ahora = new Date('2027-02-16T12:00:00Z');
    this.asignaciones = this.asignaciones.map((a) => (a.mesaId === mesaId && a.hasta === null ? { ...a, hasta: ahora } : a));
    const nueva: AsignacionMesa = { id: `a${this.asignaciones.length + 1}`, mesaId, veedorId: nuevoVeedorId, asignadoPor: 'coord', desde: ahora, hasta: null };
    this.asignaciones.push(nueva);
    return ok(undefined);
  }
}

export class OutboxEnMemoria implements ActaOutboxRepository {
  public actas: Acta[] = [];
  public envios = new Map<string, EnvioActa>();
  public falla: Error | null = null;
  /** Reloj de las marcas de tiempo (las pruebas lo fijan para controlar los reintentos). */
  public ahora = () => new Date();
  async existeParaMesaYDignidad(mesaId: string, dignidad: Dignidad) {
    return this.actas.some((a) => a.mesaId === mesaId && a.dignidad === dignidad);
  }
  async guardarYEncolar(acta: Acta) {
    if (this.falla) throw this.falla;
    this.actas.push(acta);
    this.envios.set(acta.id, { acta, estado: 'pendiente', intentos: 0, ultimoError: null, actualizadoEn: new Date(0) });
  }
  async listarPorEnviar(veedorId: string) {
    return [...this.envios.values()].filter((e) => e.acta.veedorId === veedorId && ESTADOS_REINTENTABLES.includes(e.estado));
  }
  async listarPorMesa(mesaId: string) {
    return [...this.envios.values()].filter((e) => e.acta.mesaId === mesaId);
  }
  async marcar(actaId: string, estado: EstadoEnvio, cambios: { error?: string | null; contarIntento?: boolean } = {}) {
    const e = this.envios.get(actaId);
    if (!e) return;
    this.envios.set(actaId, {
      ...e,
      estado,
      ultimoError: cambios.error !== undefined ? cambios.error : e.ultimoError,
      intentos: e.intentos + (cambios.contarIntento ? 1 : 0),
      actualizadoEn: this.ahora(),
    });
  }
}

export class FotosEnMemoria implements AlmacenFotosLocal {
  public guardadas = new Set<string>();
  async persistir(_uriTemporal: string, actaId: string) {
    const ruta = `file:///documentos/actas/${actaId}.jpg`;
    this.guardadas.add(ruta);
    return ruta;
  }
  async eliminar(ruta: string) {
    this.guardadas.delete(ruta);
  }
}

export class CuentasEnMemoria implements CuentaRepository {
  public creadas: NuevaCuenta[] = [];
  public rechazo: RechazoCrearCuenta | null = null;
  async crear(cuenta: NuevaCuenta): Promise<Result<CuentaCreada, RechazoCrearCuenta>> {
    if (this.rechazo) return fail(this.rechazo);
    this.creadas.push(cuenta);
    return ok({ perfilId: `nuevo-${this.creadas.length}`, claveTemporal: 'Temp-1234' });
  }
}
