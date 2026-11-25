// Caché local (base cifrada) para que el veedor trabaje sin conexión (ADR-15):
// perfil propio, asignación vigente, su mesa y las candidaturas de la mesa.
// Patrón: decoradores de los repositorios remotos. Con conexión se consulta el servidor y se
// guarda la respuesta; sin conexión (o si el servidor falla) se responde desde la caché.
import type { SQLiteDatabase } from 'expo-sqlite';

import type { EstadoRed } from '@/application/ports/red.port';
import type { ObservadorSesion, SesionActual } from '@/application/ports/sesion.port';
import type { AsignacionMesa } from '@/domain/entities/asignacion-mesa';
import type { Candidatura } from '@/domain/entities/candidatura';
import type { Mesa } from '@/domain/entities/mesa';
import type { Perfil } from '@/domain/entities/perfil';
import type { AsignacionMesaRepository } from '@/domain/repositories/asignacion-mesa.repository';
import type { CandidaturaRepository } from '@/domain/repositories/candidatura.repository';
import type { MesaRepository } from '@/domain/repositories/mesa.repository';
import type { Dignidad } from '@/domain/value-objects/dignidad';

export class CacheLocal {
  constructor(private readonly db: () => Promise<SQLiteDatabase>) {}

  async leer<T>(clave: string): Promise<T | undefined> {
    const db = await this.db();
    const fila = await db.getFirstAsync<{ valor: string }>('select valor from cache where clave = ?', clave);
    return fila ? (JSON.parse(fila.valor) as T) : undefined;
  }

  async guardar(clave: string, valor: unknown): Promise<void> {
    const db = await this.db();
    await db.runAsync(
      `insert into cache (clave, valor, actualizado_en) values (?, ?, ?)
       on conflict (clave) do update set valor = excluded.valor, actualizado_en = excluded.actualizado_en`,
      clave,
      JSON.stringify(valor ?? null),
      new Date().toISOString(),
    );
  }

  /** Al cerrar sesión: se borra todo lo del usuario anterior (la cola de actas NO se toca). */
  async vaciar(): Promise<void> {
    const db = await this.db();
    await db.runAsync('delete from cache');
  }
}

/**
 * Remoto primero si hay conexión; caché si no hay o si el servidor falla.
 * `undefined` en caché = nunca se guardó (no se distingue de "no existe" sin conexión).
 */
async function conCache<T>(cache: CacheLocal, red: Pick<EstadoRed, 'hayConexion'>, clave: string, remoto: () => Promise<T>): Promise<T> {
  if (await red.hayConexion()) {
    try {
      const valor = await remoto();
      await cache.guardar(clave, valor);
      return valor;
    } catch (e) {
      const guardado = await cache.leer<T>(clave);
      if (guardado !== undefined) return guardado;
      throw e;
    }
  }
  const guardado = await cache.leer<T>(clave);
  if (guardado !== undefined) return guardado;
  return remoto(); // sin caché: se intenta igual y el error llega a quien llama
}

// Las fechas vuelven como texto desde el JSON.
const conFechas = <T extends { desde: Date; hasta: Date | null }>(v: T | null): T | null =>
  v ? { ...v, desde: new Date(v.desde), hasta: v.hasta ? new Date(v.hasta) : null } : null;

type Deps = { readonly cache: CacheLocal; readonly red: Pick<EstadoRed, 'hayConexion'> };

export class SesionConCache implements SesionActual, ObservadorSesion {
  constructor(
    private readonly remota: SesionActual & ObservadorSesion & { usuarioActualId(): Promise<string | null> },
    private readonly deps: Deps,
  ) {}

  async perfilActual(): Promise<Perfil | null> {
    const { cache, red } = this.deps;
    // La sesión (token) se guarda en el teléfono. Si sin conexión no se pudo renovar el token,
    // se usa el último usuario conocido (se borra al cerrar sesión).
    let usuarioId = await this.remota.usuarioActualId().catch(() => null);
    const conectado = await red.hayConexion();
    if (usuarioId) await cache.guardar('usuario_actual', usuarioId);
    else if (!conectado) usuarioId = (await cache.leer<string>('usuario_actual')) ?? null;
    if (!usuarioId) return null;
    const id = usuarioId;
    return conCache(cache, red, `perfil:${id}`, () => this.remota.perfilActual());
  }

  suscribir(alCambiar: (usuarioId: string | null) => void): () => void {
    return this.remota.suscribir((usuarioId) => {
      if (!usuarioId) void this.deps.cache.vaciar().catch(() => undefined);
      alCambiar(usuarioId);
    });
  }
}

export class AsignacionesConCache implements AsignacionMesaRepository {
  constructor(
    private readonly remoto: AsignacionMesaRepository,
    private readonly deps: Deps,
  ) {}

  async obtenerVigentePorVeedor(veedorId: string): Promise<AsignacionMesa | null> {
    const v = await conCache(this.deps.cache, this.deps.red, `asignacion:${veedorId}`, () => this.remoto.obtenerVigentePorVeedor(veedorId));
    return conFechas(v);
  }

  obtenerVigentePorMesa(mesaId: string) {
    return this.remoto.obtenerVigentePorMesa(mesaId);
  }
  asignarVeedor(mesaId: string, veedorId: string) {
    return this.remoto.asignarVeedor(mesaId, veedorId);
  }
  reemplazarVeedor(mesaId: string, veedorActualId: string, nuevoVeedorId: string) {
    return this.remoto.reemplazarVeedor(mesaId, veedorActualId, nuevoVeedorId);
  }
}

export class MesasConCache implements Pick<MesaRepository, 'obtenerPorId'> {
  constructor(
    private readonly remoto: Pick<MesaRepository, 'obtenerPorId'>,
    private readonly deps: Deps,
  ) {}

  obtenerPorId(id: string): Promise<Mesa | null> {
    return conCache(this.deps.cache, this.deps.red, `mesa:${id}`, () => this.remoto.obtenerPorId(id));
  }
}

export class CandidaturasConCache implements CandidaturaRepository {
  constructor(
    private readonly remoto: CandidaturaRepository,
    private readonly deps: Deps,
  ) {}

  listarParaMesa(mesaId: string, dignidad: Dignidad): Promise<Candidatura[]> {
    return conCache(this.deps.cache, this.deps.red, `candidaturas:${mesaId}:${dignidad}`, () => this.remoto.listarParaMesa(mesaId, dignidad));
  }
}
