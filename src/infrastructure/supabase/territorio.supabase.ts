// Repositorios de la Fase 5 sobre PostgREST y las RPC de gestión territorial.
// RLS decide qué filas ve cada rol; las RPC validan y devuelven el código en `hint`.
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

import type { AsignacionMesa } from '@/domain/entities/asignacion-mesa';
import type { Mesa, MesaConVeedor, PersonaResumen } from '@/domain/entities/mesa';
import type { VeedorDelRecinto, VeedorRecinto } from '@/domain/entities/veedor-recinto';
import type {
  AsignacionMesaRepository,
  RechazoAsignacion,
  RechazoReemplazo,
} from '@/domain/repositories/asignacion-mesa.repository';
import type {
  CoordinacionRecintoRepository,
  CoordinacionVigente,
  RechazoCoordinacion,
} from '@/domain/repositories/coordinacion-recinto.repository';
import type { MesaRepository, RechazoMesas } from '@/domain/repositories/mesa.repository';
import type { RechazoRecinto, RecintoRepository } from '@/domain/repositories/recinto.repository';
import type { VeedorRecintoRepository } from '@/domain/repositories/veedor-recinto.repository';
import type { NuevoRecinto, RangoMesas } from '@/domain/schemas/territorio.schema';
import { fail, ok, type Result } from '@/domain/shared/result';

import { aCoordinacionRecinto, aRecinto, COLUMNAS_RECINTO, type FilaCoordinacionRecinto, type FilaRecinto } from './mapeos';

const PERSONA = 'id, nombres, apellidos, telefono';
type FilaPersona = PersonaResumen;

const lanzar = (que: string, e: PostgrestError): never => {
  throw new Error(`No se pudo ${que}: ${e.message}`);
};

/** Devuelve el código de rechazo si el error es uno esperado; si no, lanza. */
function rechazoDe<C extends string>(e: PostgrestError, validos: readonly C[], que: string): C {
  if (validos.includes(e.hint as C)) return e.hint as C;
  return lanzar(que, e);
}

// ---------------------------------------------------------------------------
export class RecintosSupabase implements RecintoRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async listarVisibles() {
    const { data, error } = await this.supabase.from('recintos').select(COLUMNAS_RECINTO).returns<FilaRecinto[]>();
    if (error) lanzar('leer los recintos', error);
    return (data ?? []).map(aRecinto);
  }

  async listarParroquias() {
    const { data, error } = await this.supabase.from('parroquias').select('id, nombre').returns<{ id: number; nombre: string }[]>();
    if (error) lanzar('leer las parroquias', error);
    return data ?? [];
  }

  async crear(r: NuevoRecinto, creadoPor: string): Promise<Result<ReturnType<typeof aRecinto>, RechazoRecinto>> {
    const { data, error } = await this.supabase
      .from('recintos')
      .insert({
        parroquia_id: r.parroquiaId,
        codigo: r.codigo,
        nombre: r.nombre,
        codigo_zona: r.codigoZona,
        nombre_zona: r.nombreZona,
        direccion: r.direccion,
        lat: r.ubicacion.lat,
        lng: r.ubicacion.lng,
        precision_m: r.ubicacion.precisionM,
        dificil_acceso: r.dificilAcceso,
        sin_conectividad: r.sinConectividad,
        creado_por: creadoPor,
      })
      .select(COLUMNAS_RECINTO)
      .single<FilaRecinto>();
    if (error) {
      if (error.code === '23505') return fail('codigo_duplicado');
      if (error.code === '42501') return fail('sin_permiso');
      lanzar('crear el recinto', error);
    }
    return ok(aRecinto(data!));
  }
}

// ---------------------------------------------------------------------------
type FilaMesa = {
  id: string;
  recinto_id: string;
  numero: number;
  sexo: 'F' | 'M';
  numero_electores: number | null;
  asignaciones_mesa?: { veedor: FilaPersona | null }[];
};

const aMesa = (f: FilaMesa): Mesa => ({
  id: f.id,
  recintoId: f.recinto_id,
  numero: f.numero,
  sexo: f.sexo,
  numeroElectores: f.numero_electores,
});

export class MesasSupabase implements MesaRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async obtenerPorId(id: string) {
    const { data, error } = await this.supabase
      .from('mesas')
      .select('id, recinto_id, numero, sexo, numero_electores')
      .eq('id', id)
      .maybeSingle<FilaMesa>();
    if (error) lanzar('leer la mesa', error);
    return data ? aMesa(data) : null;
  }

  async listarPorRecinto(recintoId: string): Promise<MesaConVeedor[]> {
    const { data, error } = await this.supabase
      .from('mesas')
      .select(`id, recinto_id, numero, sexo, numero_electores, asignaciones_mesa(veedor:perfiles!asignaciones_mesa_veedor_id_fkey(${PERSONA}))`)
      .eq('recinto_id', recintoId)
      .is('asignaciones_mesa.hasta', null)
      .returns<FilaMesa[]>();
    if (error) lanzar('leer las mesas', error);
    return (data ?? []).map((f) => ({ ...aMesa(f), veedor: f.asignaciones_mesa?.[0]?.veedor ?? null }));
  }

  async agregarRango(recintoId: string, rango: RangoMesas): Promise<Result<number, RechazoMesas>> {
    const { data, error } = await this.supabase.rpc('agregar_mesas', {
      p_recinto: recintoId,
      p_sexo: rango.sexo,
      p_desde: rango.desde,
      p_hasta: rango.hasta,
    });
    if (!error) return ok(Number(data));
    if (error.hint === 'mesas_existentes') return fail({ codigo: 'mesas_existentes', existentes: error.details ?? '' });
    return fail({ codigo: rechazoDe(error, ['sin_permiso', 'rango_invalido'] as const, 'agregar las mesas') });
  }
}

// ---------------------------------------------------------------------------
export class CoordinacionesSupabase implements CoordinacionRecintoRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async obtenerVigentePorRecinto(recintoId: string) {
    const { data, error } = await this.supabase
      .from('coordinaciones_recinto')
      .select('id, recinto_id, coordinador_id, desde, hasta')
      .eq('recinto_id', recintoId)
      .is('hasta', null)
      .maybeSingle<FilaCoordinacionRecinto>();
    if (error) lanzar('leer la coordinación', error);
    return data ? aCoordinacionRecinto(data) : null;
  }

  async listarVigentes(): Promise<CoordinacionVigente[]> {
    const { data, error } = await this.supabase
      .from('coordinaciones_recinto')
      .select(`recinto_id, coordinador:perfiles!coordinaciones_recinto_coordinador_id_fkey(${PERSONA})`)
      .is('hasta', null)
      .returns<{ recinto_id: string; coordinador: FilaPersona | null }[]>();
    if (error) lanzar('leer las coordinaciones', error);
    return (data ?? []).flatMap((f) => (f.coordinador ? [{ recintoId: f.recinto_id, coordinador: f.coordinador }] : []));
  }

  async asignar(recintoId: string, coordinadorId: string): Promise<Result<void, RechazoCoordinacion>> {
    const { error } = await this.supabase.rpc('asignar_coordinador', { p_recinto: recintoId, p_coordinador: coordinadorId });
    if (!error) return ok(undefined);
    return fail(rechazoDe(error, ['sin_permiso', 'coordinador_no_valido', 'ya_asignado', 'coordinador_con_recinto'] as const, 'asignar el coordinador'));
  }
}

// ---------------------------------------------------------------------------
type FilaAsignacion = { id: string; mesa_id: string; veedor_id: string; asignado_por: string; desde: string; hasta: string | null };
const aAsignacion = (f: FilaAsignacion): AsignacionMesa => ({
  id: f.id,
  mesaId: f.mesa_id,
  veedorId: f.veedor_id,
  asignadoPor: f.asignado_por,
  desde: new Date(f.desde),
  hasta: f.hasta ? new Date(f.hasta) : null,
});
const COLUMNAS_ASIGNACION = 'id, mesa_id, veedor_id, asignado_por, desde, hasta';

const RECHAZOS_REEMPLAZO = [
  'no_es_coordinador_vigente',
  'mesa_sin_veedor',
  'veedor_no_valido',
  'veedor_de_otro_recinto',
  'veedor_con_otra_mesa',
  'reemplazo_concurrente',
] as const;

export class AsignacionesSupabase implements AsignacionMesaRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  private async vigente(columna: 'mesa_id' | 'veedor_id', id: string) {
    const { data, error } = await this.supabase
      .from('asignaciones_mesa')
      .select(COLUMNAS_ASIGNACION)
      .eq(columna, id)
      .is('hasta', null)
      .maybeSingle<FilaAsignacion>();
    if (error) lanzar('leer la asignación', error);
    return data ? aAsignacion(data) : null;
  }

  obtenerVigentePorMesa(mesaId: string) {
    return this.vigente('mesa_id', mesaId);
  }

  obtenerVigentePorVeedor(veedorId: string) {
    return this.vigente('veedor_id', veedorId);
  }

  async asignarVeedor(mesaId: string, veedorId: string): Promise<Result<void, RechazoAsignacion>> {
    const { error } = await this.supabase.rpc('asignar_veedor', { p_mesa: mesaId, p_veedor: veedorId });
    if (!error) return ok(undefined);
    const validos = [...RECHAZOS_REEMPLAZO.filter((c) => c !== 'mesa_sin_veedor'), 'mesa_con_veedor'] as RechazoAsignacion[];
    return fail(rechazoDe(error, validos, 'asignar el veedor'));
  }

  async reemplazarVeedor(mesaId: string, veedorActualId: string, nuevoVeedorId: string): Promise<Result<void, RechazoReemplazo>> {
    const { error } = await this.supabase.rpc('reemplazar_veedor', {
      p_mesa: mesaId,
      p_veedor_actual: veedorActualId,
      p_nuevo_veedor: nuevoVeedorId,
    });
    if (!error) return ok(undefined);
    return fail(rechazoDe(error, RECHAZOS_REEMPLAZO, 'reemplazar el veedor'));
  }
}

// ---------------------------------------------------------------------------
type FilaVeedorRecinto = { id: string; veedor_id: string; recinto_id: string; desde: string; hasta: string | null };

export class VeedoresRecintoSupabase implements VeedorRecintoRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async obtenerVigentePorVeedor(veedorId: string): Promise<VeedorRecinto | null> {
    const { data, error } = await this.supabase
      .from('veedores_recinto')
      .select('id, veedor_id, recinto_id, desde, hasta')
      .eq('veedor_id', veedorId)
      .is('hasta', null)
      .maybeSingle<FilaVeedorRecinto>();
    if (error) lanzar('leer el recinto del veedor', error);
    return data
      ? { id: data.id, veedorId: data.veedor_id, recintoId: data.recinto_id, desde: new Date(data.desde), hasta: data.hasta ? new Date(data.hasta) : null }
      : null;
  }

  async listarPorRecinto(recintoId: string): Promise<VeedorDelRecinto[]> {
    const { data, error } = await this.supabase
      .from('veedores_recinto')
      .select(`veedor:perfiles!veedores_recinto_veedor_id_fkey(${PERSONA}, activo)`)
      .eq('recinto_id', recintoId)
      .is('hasta', null)
      .returns<{ veedor: (FilaPersona & { activo: boolean }) | null }[]>();
    if (error) lanzar('leer los veedores', error);
    const veedores = (data ?? []).flatMap((f) => (f.veedor ? [f.veedor] : []));
    if (veedores.length === 0) return [];

    const { data: asignaciones, error: e2 } = await this.supabase
      .from('asignaciones_mesa')
      .select('veedor_id, mesa_id')
      .in('veedor_id', veedores.map((v) => v.id))
      .is('hasta', null)
      .returns<{ veedor_id: string; mesa_id: string }[]>();
    if (e2) lanzar('leer las asignaciones', e2);
    const mesaDe = new Map((asignaciones ?? []).map((a) => [a.veedor_id, a.mesa_id]));
    return veedores.map((v) => ({ ...v, mesaId: mesaDe.get(v.id) ?? null }));
  }
}
