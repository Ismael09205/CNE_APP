// Fase 7 — Seguimiento del escrutinio (RF-17, ADR-17). Solo lectura: los conteos los hace
// la base (funciones SQL) y la RLS decide el alcance de cada persona (ADR-16).
import { requiereRevisionUbicacion } from '../rules/evidencia.rules';
import type { Dignidad } from '../value-objects/dignidad';
import type { SexoJunta } from '../value-objects/sexo-junta';

export type Coordenadas = { readonly lat: number; readonly lng: number };

/** Avance de un recinto: actas esperadas (una por dignidad y mesa) y recibidas. */
export type AvanceRecinto = {
  readonly recintoId: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly parroquia: string;
  readonly ubicacion: Coordenadas | null;
  readonly sinConectividad: boolean;
  readonly mesas: number;
  readonly actasEsperadas: number;
  readonly actasAlcaldia: number;
  readonly actasPrefectura: number;
  /** F6-4: actas con ubicación imprecisa o simulada. */
  readonly actasEnRevision: number;
  readonly ultimaRecibida: Date | null;
};

export const actasRecibidas = (a: Pick<AvanceRecinto, 'actasAlcaldia' | 'actasPrefectura'>) => a.actasAlcaldia + a.actasPrefectura;

/** Votos de una candidatura (lista) en una dignidad. */
export type TotalCandidatura = {
  readonly candidaturaId: string;
  readonly lista: string;
  readonly organizacionPolitica: string;
  readonly candidato: string;
  readonly binomio: string | null;
  /** RNF-07, D-18: color de la lista. */
  readonly color: string;
  readonly votos: number;
};

export type ResumenVotos = {
  readonly actas: number;
  readonly sufragantes: number;
  readonly blancos: number;
  readonly nulos: number;
};

/** Totales de todos los recintos visibles (encabezado del tablero). */
export type AvanceGeneral = {
  readonly recintos: number;
  readonly recintosCompletos: number;
  readonly actasEsperadas: number;
  readonly actasRecibidas: number;
  readonly actasEnRevision: number;
};

export function avanceGeneral(recintos: readonly AvanceRecinto[]): AvanceGeneral {
  return recintos.reduce<AvanceGeneral>(
    (t, r) => ({
      recintos: t.recintos + 1,
      recintosCompletos: t.recintosCompletos + (r.actasEsperadas > 0 && actasRecibidas(r) >= r.actasEsperadas ? 1 : 0),
      actasEsperadas: t.actasEsperadas + r.actasEsperadas,
      actasRecibidas: t.actasRecibidas + actasRecibidas(r),
      actasEnRevision: t.actasEnRevision + r.actasEnRevision,
    }),
    { recintos: 0, recintosCompletos: 0, actasEsperadas: 0, actasRecibidas: 0, actasEnRevision: 0 },
  );
}

/** Proporción 0–1 (0 si el total es 0). */
export const proporcion = (parte: number, total: number) => (total > 0 ? Math.min(1, Math.max(0, parte / total)) : 0);

/** Porcentaje con un decimal, como se publica en un escrutinio («23,4 %»). */
export const porcentajeTexto = (parte: number, total: number) =>
  `${(proporcion(parte, total) * 100).toLocaleString('es-EC', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;

/**
 * Orden del tablero: primero los recintos con menos avance (los que hay que seguir),
 * luego por nombre. Los recintos sin mesas van al final.
 */
export const ordenarPorAvance = (recintos: readonly AvanceRecinto[]): AvanceRecinto[] =>
  [...recintos].sort(
    (a, b) =>
      Number(a.actasEsperadas === 0) - Number(b.actasEsperadas === 0) ||
      proporcion(actasRecibidas(a), a.actasEsperadas) - proporcion(actasRecibidas(b), b.actasEsperadas) ||
      a.nombre.localeCompare(b.nombre, 'es'),
  );

/** Acta recibida en el servidor (listado de un recinto). */
export type ActaRecibida = {
  readonly id: string;
  readonly mesaId: string;
  readonly dignidad: Dignidad;
  readonly recibidaEn: Date | null;
  readonly requiereRevision: boolean;
};

/** Detalle de un acta para revisarla (votos, foto y lugar de registro, RF-13, RF-17). */
export type DetalleActa = {
  readonly id: string;
  readonly dignidad: Dignidad;
  readonly mesa: { readonly id: string; readonly numero: number; readonly sexo: SexoJunta };
  readonly recinto: { readonly id: string; readonly nombre: string; readonly ubicacion: Coordenadas | null };
  readonly totalSufragantes: number;
  readonly votosBlancos: number;
  readonly votosNulos: number;
  readonly votos: readonly Omit<TotalCandidatura, 'binomio'>[];
  readonly fotoPath: string;
  readonly ubicacion: Coordenadas & { readonly precisionM: number; readonly simulada: boolean };
  readonly confirmadaEn: Date;
  readonly recibidaEn: Date | null;
};

export const detalleRequiereRevision = (d: Pick<DetalleActa, 'ubicacion'>) =>
  requiereRevisionUbicacion({ precisionM: d.ubicacion.precisionM, ubicacionSimulada: d.ubicacion.simulada });

/** Distancia aproximada en metros entre el punto del acta y el recinto (fórmula de haversine). */
export function distanciaMetros(a: Coordenadas, b: Coordenadas): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Filtros del avance por recinto (la información útil suele ser «a qué recinto le faltan actas»). */
export const FILTROS_AVANCE = ['faltan', 'conActas', 'revisar', 'completos', 'todos'] as const;
export type FiltroAvance = (typeof FILTROS_AVANCE)[number];

const completo = (r: AvanceRecinto) => r.actasEsperadas > 0 && actasRecibidas(r) >= r.actasEsperadas;

export function cumpleFiltro(r: AvanceRecinto, filtro: FiltroAvance): boolean {
  switch (filtro) {
    case 'faltan':
      return r.actasEsperadas > 0 && !completo(r);
    case 'conActas':
      return actasRecibidas(r) > 0;
    case 'revisar':
      return r.actasEnRevision > 0;
    case 'completos':
      return completo(r);
    case 'todos':
      return true;
  }
}

/** Sin tildes ni mayúsculas, para buscar «cotacachi» y encontrar «COTACACHI». */
const normalizar = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/** Busca por nombre, parroquia o código del recinto. */
export const coincideBusqueda = (r: Pick<AvanceRecinto, 'nombre' | 'parroquia' | 'codigo'>, texto: string) => {
  const q = normalizar(texto);
  return !q || [r.nombre, r.parroquia, r.codigo].some((c) => normalizar(c).includes(q));
};
