// Fase 7 — Seguimiento (ADR-17): funciones SQL de conteo, detalle del acta, fotos firmadas
// del bucket privado (ADR-13) y aviso de actas nuevas con Supabase Realtime.
// Todo pasa por la RLS de quien consulta (ADR-16).
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

import type { FotosActaRemotas, ObservadorActas } from '@/application/ports/seguimiento.port';
import {
  type ActaRecibida,
  type AvanceRecinto,
  type Coordenadas,
  type DetalleActa,
  type ResumenVotos,
  type TotalCandidatura,
} from '@/domain/entities/resultados';
import type { ResultadosRepository } from '@/domain/repositories/resultados.repository';
import { requiereRevisionUbicacion } from '@/domain/rules/evidencia.rules';
import { esDignidad, type Dignidad } from '@/domain/value-objects/dignidad';
import type { SexoJunta } from '@/domain/value-objects/sexo-junta';

const lanzar = (que: string, e: PostgrestError): never => {
  throw new Error(`No se pudo ${que}: ${e.message}`);
};

const coordenadas = (lat: number | null, lng: number | null): Coordenadas | null =>
  lat == null || lng == null ? null : { lat, lng };
const fecha = (v: string | null) => (v ? new Date(v) : null);
const dignidad = (v: string): Dignidad => {
  if (!esDignidad(v)) throw new Error(`Dignidad desconocida: ${v}`);
  return v;
};

type FilaAvance = {
  recinto_id: string;
  codigo: string;
  nombre: string;
  parroquia: string;
  lat: number | null;
  lng: number | null;
  sin_conectividad: boolean;
  mesas: number;
  actas_esperadas: number;
  actas_alcaldia: number;
  actas_prefectura: number;
  actas_en_revision: number;
  ultima_recibida: string | null;
};

type FilaTotal = {
  candidatura_id: string;
  lista: string;
  organizacion_politica: string;
  candidato: string;
  binomio: string | null;
  color: string;
  votos: number | string; // bigint puede llegar como texto
};

type FilaActaRecibida = {
  id: string;
  mesa_id: string;
  dignidad: string;
  recibida_en: string | null;
  precision_m: number;
  ubicacion_simulada: boolean;
};

type FilaDetalle = {
  id: string;
  dignidad: string;
  total_sufragantes: number;
  votos_blancos: number;
  votos_nulos: number;
  foto_path: string;
  lat: number;
  lng: number;
  precision_m: number;
  ubicacion_simulada: boolean;
  confirmada_en: string;
  recibida_en: string | null;
  mesas: {
    id: string;
    numero: number;
    sexo: SexoJunta;
    recintos: { id: string; nombre: string; lat: number | null; lng: number | null };
  };
  votos_acta: {
    votos: number;
    candidaturas: { id: string; lista: string; organizacion_politica: string; candidato: string; color: string };
  }[];
};

const aTotal = (f: FilaTotal): TotalCandidatura => ({
  candidaturaId: f.candidatura_id,
  lista: f.lista,
  organizacionPolitica: f.organizacion_politica,
  candidato: f.candidato,
  binomio: f.binomio,
  color: f.color,
  votos: Number(f.votos),
});

export class ResultadosSupabase implements ResultadosRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async avancePorRecinto(): Promise<AvanceRecinto[]> {
    const { data, error } = await this.supabase.rpc('avance_por_recinto');
    if (error) lanzar('leer el avance por recinto', error);
    return ((data ?? []) as FilaAvance[]).map((f) => ({
      recintoId: f.recinto_id,
      codigo: f.codigo,
      nombre: f.nombre,
      parroquia: f.parroquia,
      ubicacion: coordenadas(f.lat, f.lng),
      sinConectividad: f.sin_conectividad,
      mesas: f.mesas,
      actasEsperadas: f.actas_esperadas,
      actasAlcaldia: f.actas_alcaldia,
      actasPrefectura: f.actas_prefectura,
      actasEnRevision: f.actas_en_revision,
      ultimaRecibida: fecha(f.ultima_recibida),
    }));
  }

  async totalesPorCandidato(d: Dignidad, recintoId?: string): Promise<TotalCandidatura[]> {
    const { data, error } = await this.supabase
      .rpc('totales_por_candidato', { p_dignidad: d, p_recinto: recintoId ?? null });
    if (error) lanzar('leer los votos por candidato', error);
    return ((data ?? []) as FilaTotal[]).map(aTotal);
  }

  async resumenVotos(d: Dignidad, recintoId?: string): Promise<ResumenVotos> {
    const { data, error } = await this.supabase
      .rpc('resumen_votos', { p_dignidad: d, p_recinto: recintoId ?? null });
    if (error) lanzar('leer el resumen de votos', error);
    const fila = ((data ?? []) as ResumenVotos[])[0];
    return { actas: fila?.actas ?? 0, sufragantes: fila?.sufragantes ?? 0, blancos: fila?.blancos ?? 0, nulos: fila?.nulos ?? 0 };
  }

  async actasDeRecinto(recintoId: string): Promise<ActaRecibida[]> {
    const { data, error } = await this.supabase
      .from('actas')
      .select('id, mesa_id, dignidad, recibida_en, precision_m, ubicacion_simulada, mesas!inner(recinto_id)')
      .eq('mesas.recinto_id', recintoId)
      .eq('estado', 'enviada')
      .returns<FilaActaRecibida[]>();
    if (error) lanzar('leer las actas del recinto', error);
    return (data ?? []).map((f) => ({
      id: f.id,
      mesaId: f.mesa_id,
      dignidad: dignidad(f.dignidad),
      recibidaEn: fecha(f.recibida_en),
      requiereRevision: requiereRevisionUbicacion({ precisionM: f.precision_m, ubicacionSimulada: f.ubicacion_simulada }),
    }));
  }

  async detalleActa(actaId: string): Promise<DetalleActa | null> {
    const { data, error } = await this.supabase
      .from('actas')
      .select(
        `id, dignidad, total_sufragantes, votos_blancos, votos_nulos, foto_path, lat, lng, precision_m,
         ubicacion_simulada, confirmada_en, recibida_en,
         mesas!inner(id, numero, sexo, recintos!inner(id, nombre, lat, lng)),
         votos_acta(votos, candidaturas!inner(id, lista, organizacion_politica, candidato, color))`,
      )
      .eq('id', actaId)
      .eq('estado', 'enviada')
      .maybeSingle<FilaDetalle>();
    if (error) lanzar('leer el acta', error);
    if (!data) return null;
    const votos = data.votos_acta
      .map((v) => ({
        candidaturaId: v.candidaturas.id,
        lista: v.candidaturas.lista,
        organizacionPolitica: v.candidaturas.organizacion_politica,
        candidato: v.candidaturas.candidato,
        color: v.candidaturas.color,
        votos: v.votos,
      }))
      .sort((a, b) => b.votos - a.votos || a.lista.localeCompare(b.lista, 'es', { numeric: true }));
    return {
      id: data.id,
      dignidad: dignidad(data.dignidad),
      mesa: { id: data.mesas.id, numero: data.mesas.numero, sexo: data.mesas.sexo },
      recinto: {
        id: data.mesas.recintos.id,
        nombre: data.mesas.recintos.nombre,
        ubicacion: coordenadas(data.mesas.recintos.lat, data.mesas.recintos.lng),
      },
      totalSufragantes: data.total_sufragantes,
      votosBlancos: data.votos_blancos,
      votosNulos: data.votos_nulos,
      votos,
      fotoPath: data.foto_path,
      ubicacion: { lat: data.lat, lng: data.lng, precisionM: data.precision_m, simulada: data.ubicacion_simulada },
      confirmadaEn: new Date(data.confirmada_en),
      recibidaEn: fecha(data.recibida_en),
    };
  }
}

/** URL firmada de 10 minutos: la foto nunca es pública (ADR-13). */
export class FotosActaSupabase implements FotosActaRemotas {
  constructor(private readonly supabase: SupabaseClient) {}

  async urlFirmada(fotoPath: string): Promise<string | null> {
    const { data, error } = await this.supabase.storage.from('actas').createSignedUrl(fotoPath, 600);
    return error ? null : data.signedUrl;
  }
}

/** Escucha las actas nuevas (INSERT). Los eventos llegan filtrados por la RLS de `actas` (ADR-16). */
export class ObservadorActasSupabase implements ObservadorActas {
  constructor(private readonly supabase: SupabaseClient) {}

  suscribir(alLlegar: () => void): () => void {
    const canal = this.supabase
      .channel(`actas-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'actas' }, () => alLlegar())
      .subscribe();
    return () => {
      void this.supabase.removeChannel(canal);
    };
  }
}
