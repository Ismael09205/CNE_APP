// Envío de actas a Supabase (F10, ADR-15) y catálogo de candidaturas de la mesa.
// Foto: Storage `actas/{mesa_id}/{dignidad}.jpg`. Acta: RPC `registrar_acta` (solo INSERT).
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { File } from 'expo-file-system';

import {
  FallaRed,
  SesionVencida,
  type RechazoRegistro,
  type RespuestaRegistro,
  type ResultadoSubidaFoto,
  type ServidorActas,
} from '@/application/ports/servidor-actas.port';
import type { Acta } from '@/domain/entities/acta';
import type { Candidatura } from '@/domain/entities/candidatura';
import type { CandidaturaRepository } from '@/domain/repositories/candidatura.repository';
import { esDignidad, type Dignidad } from '@/domain/value-objects/dignidad';

const RECHAZOS: readonly RechazoRegistro[] = [
  'no_autorizado',
  'datos_invalidos',
  'hora_invalida',
  'fuera_de_vigencia',
  'foto_faltante',
  'candidatura_desconocida',
  'candidatura_faltante',
  'total_mayor_que_maximo',
  'votos_mayor_que_total',
  'suma_no_cuadra',
];

/** Sin respuesta HTTP, tiempo agotado o error 5xx/429: se reintenta más tarde. */
function esTransitorio(error: { message?: string; status?: number; statusCode?: string | number } | null): boolean {
  if (!error) return false;
  const status = Number(error.status ?? error.statusCode ?? 0);
  if (status === 0 || status === 408 || status === 429 || status >= 500) return true;
  return /network request failed|failed to fetch|timeout|timed out|fetch failed/i.test(error.message ?? '');
}

const esSesionVencida = (error: { status?: number; statusCode?: string | number; code?: string; message?: string }) =>
  Number(error.status ?? error.statusCode) === 401 || error.code === 'PGRST301' || /jwt expired/i.test(error.message ?? '');

export const rutaFoto = (acta: Pick<Acta, 'mesaId' | 'dignidad'>) => `${acta.mesaId}/${acta.dignidad}.jpg`;

/** JSON que espera `registrar_acta(p_acta jsonb)`. */
export const aJsonRpc = (acta: Acta) => ({
  id: acta.id,
  mesa_id: acta.mesaId,
  dignidad: acta.dignidad,
  votos_nulos: acta.votosNulos,
  votos_blancos: acta.votosBlancos,
  total_sufragantes: acta.totalSufragantes,
  confirmada_en: acta.confirmadaEn.toISOString(),
  capturada_en: acta.evidencia.capturadaEn.toISOString(),
  lat: acta.evidencia.lat,
  lng: acta.evidencia.lng,
  precision_m: acta.evidencia.precisionM,
  ubicacion_simulada: acta.evidencia.ubicacionSimulada,
  votos: acta.votos.map((v) => ({ candidatura_id: v.candidaturaId, votos: v.votos })),
});

/** `status` es el HTTP de la respuesta (0 = sin respuesta). PostgrestError no lo trae. */
export function interpretarRpc(data: unknown, error: PostgrestError | null, status: number): RespuestaRegistro {
  if (!error) {
    if (data === 'guardada' || data === 'ya_guardada' || data === 'conflicto') return { tipo: data };
    return { tipo: 'rechazada', motivo: 'rechazo_desconocido' };
  }
  if (esSesionVencida({ ...error, status })) throw new SesionVencida();
  if (esTransitorio({ message: error.message, status })) throw new FallaRed(error.message);
  const hint = (error.hint ?? '') as RechazoRegistro;
  return { tipo: 'rechazada', motivo: RECHAZOS.includes(hint) ? hint : 'rechazo_desconocido' };
}

export class ActasSupabase implements ServidorActas {
  constructor(private readonly supabase: SupabaseClient) {}

  async subirFoto(acta: Acta, opciones: { readonly reemplazar: boolean }): Promise<ResultadoSubidaFoto> {
    let cuerpo: ArrayBuffer;
    try {
      cuerpo = await new File(acta.evidencia.fotoPath).arrayBuffer();
    } catch {
      // La foto local ya no existe (p. ej. se subió y se borró en un intento anterior).
      return 'ya_existe';
    }
    const { error } = await this.supabase.storage
      .from('actas')
      .upload(rutaFoto(acta), cuerpo, { contentType: 'image/jpeg', upsert: opciones.reemplazar, cacheControl: '3600' });
    if (!error) return 'subida';

    const e = error as { message?: string; status?: number; statusCode?: string | number };
    const status = Number(e.statusCode ?? e.status ?? 0);
    if (status === 409 || /already exists|duplicate/i.test(e.message ?? '')) return 'ya_existe';
    if (status === 401 && /jwt|token/i.test(e.message ?? '')) throw new SesionVencida();
    if (esTransitorio(e)) throw new FallaRed(e.message);
    return 'sin_permiso'; // 400/403: lo rechaza la política de Storage
  }

  async registrar(acta: Acta): Promise<RespuestaRegistro> {
    let respuesta: Awaited<ReturnType<typeof this.llamarRpc>>;
    try {
      respuesta = await this.llamarRpc(acta);
    } catch (e) {
      throw new FallaRed(e instanceof Error ? e.message : undefined);
    }
    return interpretarRpc(respuesta.data, respuesta.error, respuesta.status);
  }

  private llamarRpc(acta: Acta) {
    return this.supabase.rpc('registrar_acta', { p_acta: aJsonRpc(acta) });
  }

  async dignidadesRegistradas(mesaId: string): Promise<Dignidad[]> {
    const { data, error, status } = await this.supabase.from('actas').select('dignidad').eq('mesa_id', mesaId).returns<{ dignidad: string }[]>();
    if (error) throw esTransitorio({ message: error.message, status }) ? new FallaRed(error.message) : new Error(error.message);
    return (data ?? []).map((f) => f.dignidad).filter(esDignidad);
  }
}

type FilaCandidatura = {
  id: string;
  dignidad: Dignidad;
  provincia_id: number;
  canton_id: number | null;
  lista: string;
  organizacion_politica: string;
  candidato: string;
  binomio: string | null;
  color: string;
};

type FilaMesaCircunscripcion = { recintos: { parroquias: { canton_id: number; cantones: { provincia_id: number } } } };

export class CandidaturasSupabase implements CandidaturaRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async listarParaMesa(mesaId: string, dignidad: Dignidad): Promise<Candidatura[]> {
    const { data: mesa, error: errorMesa } = await this.supabase
      .from('mesas')
      .select('recintos(parroquias(canton_id, cantones(provincia_id)))')
      .eq('id', mesaId)
      .maybeSingle<FilaMesaCircunscripcion>();
    if (errorMesa) throw new Error(`No se pudo leer la mesa: ${errorMesa.message}`);
    if (!mesa) return [];
    const cantonId = mesa.recintos.parroquias.canton_id;
    const provinciaId = mesa.recintos.parroquias.cantones.provincia_id;

    let consulta = this.supabase
      .from('candidaturas')
      .select('id, dignidad, provincia_id, canton_id, lista, organizacion_politica, candidato, binomio, color')
      .eq('dignidad', dignidad)
      .eq('provincia_id', provinciaId);
    if (dignidad === 'alcaldia') consulta = consulta.eq('canton_id', cantonId);
    const { data, error } = await consulta.order('lista').returns<FilaCandidatura[]>();
    if (error) throw new Error(`No se pudieron leer las candidaturas: ${error.message}`);

    return (data ?? []).map((f) => ({
      id: f.id,
      dignidad: f.dignidad,
      provinciaId: f.provincia_id,
      cantonId: f.canton_id,
      lista: f.lista,
      organizacionPolitica: f.organizacion_politica,
      candidato: f.candidato,
      binomio: f.binomio,
      color: f.color,
    }));
  }
}
