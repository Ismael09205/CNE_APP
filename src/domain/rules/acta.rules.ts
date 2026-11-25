// Reglas de negocio de los resultados del acta (ADR-12, PROJECT_SPEC §3.3).
// Única fuente de verdad en la app: la usan el esquema Zod (formulario) y el caso de uso.
// Deben coincidir con los CHECK/trigger de PostgreSQL.
import type { Violacion } from '../shared/violacion';

export type VotoCandidaturaInput = {
  readonly candidaturaId: string;
  readonly votos: number;
};

export type ResultadosActaInput = {
  readonly votosNulos: number;
  readonly votosBlancos: number;
  readonly totalSufragantes: number;
  readonly votos: readonly VotoCandidaturaInput[];
};

export type OpcionesValidacionActa = {
  /** Candidaturas de la dignidad del acta. Todas son obligatorias, una sola vez cada una. */
  readonly candidaturaIds: readonly string[];
  /** Electores de la mesa. Si es null o undefined no se valida (dato [POR DEFINIR] en el spec). */
  readonly maxSufragantes?: number | null;
};

const esEnteroNoNegativo = (n: number) => Number.isInteger(n) && n >= 0;

/** F6-8: el acta física tiene casillas de centena, decena y unidad para cada valor. */
export const MAX_CASILLA_ACTA = 999;

export const MENSAJES_ACTA = {
  entero: 'Escriba un número entero igual o mayor que 0.',
  tresDigitos: `Máximo ${MAX_CASILLA_ACTA}: el acta tiene tres casillas (centena, decena y unidad).`,
  votosMayorQueTotal: 'Los votos no pueden ser más que el total de sufragantes.',
  totalMayorQueMaximo: (max: number) => `El total de sufragantes no puede pasar de ${max} (electores de la mesa).`,
  sumaNoCuadra: (suma: number, total: number) =>
    `La suma de votos, nulos y blancos (${suma}) no coincide con el total de sufragantes (${total}).`,
  candidaturaFaltante: 'Faltan los votos de una o más listas.',
  candidaturaDesconocida: 'Hay votos de una lista que no participa en esta dignidad.',
  candidaturaRepetida: 'Hay votos repetidos para la misma lista.',
} as const;

export function validarResultadosActa(acta: ResultadosActaInput, opciones: OpcionesValidacionActa): Violacion[] {
  const violaciones: Violacion[] = [];
  const agregar = (campo: Violacion['campo'], codigo: string, mensaje: string) =>
    violaciones.push({ campo, codigo, mensaje });

  // 1. Todos los valores son enteros ≥ 0.
  const campos = [
    ['votosNulos', acta.votosNulos],
    ['votosBlancos', acta.votosBlancos],
    ['totalSufragantes', acta.totalSufragantes],
  ] as const;
  for (const [campo, valor] of campos) {
    if (!esEnteroNoNegativo(valor)) agregar([campo], 'entero', MENSAJES_ACTA.entero);
  }
  acta.votos.forEach((voto, i) => {
    if (!esEnteroNoNegativo(voto.votos)) agregar(['votos', i, 'votos'], 'entero', MENSAJES_ACTA.entero);
  });

  // 2. Todas las candidaturas de la dignidad, sin repetir.
  const esperadas = new Set(opciones.candidaturaIds);
  const vistas = new Set<string>();
  acta.votos.forEach((voto, i) => {
    if (!esperadas.has(voto.candidaturaId)) {
      agregar(['votos', i, 'candidaturaId'], 'candidatura_desconocida', MENSAJES_ACTA.candidaturaDesconocida);
    } else if (vistas.has(voto.candidaturaId)) {
      agregar(['votos', i, 'candidaturaId'], 'candidatura_repetida', MENSAJES_ACTA.candidaturaRepetida);
    }
    vistas.add(voto.candidaturaId);
  });
  if ([...esperadas].some((id) => !vistas.has(id))) {
    agregar(['votos'], 'candidatura_faltante', MENSAJES_ACTA.candidaturaFaltante);
  }

  // Las reglas de cifras solo tienen sentido si los números son válidos.
  if (violaciones.some((v) => v.codigo === 'entero')) return violaciones;

  // 1b. Tres dígitos como máximo, igual que las casillas del acta (F6-8).
  for (const [campo, valor] of campos) {
    if (valor > MAX_CASILLA_ACTA) agregar([campo], 'tres_digitos', MENSAJES_ACTA.tresDigitos);
  }
  acta.votos.forEach((voto, i) => {
    if (voto.votos > MAX_CASILLA_ACTA) agregar(['votos', i, 'votos'], 'tres_digitos', MENSAJES_ACTA.tresDigitos);
  });

  // 3. Máximo de sufragantes de la mesa (opcional).
  const max = opciones.maxSufragantes;
  if (max != null && acta.totalSufragantes > max) {
    agregar(['totalSufragantes'], 'total_mayor_que_maximo', MENSAJES_ACTA.totalMayorQueMaximo(max));
  }

  // 4. Votos de cada lista ≤ total de sufragantes.
  acta.votos.forEach((voto, i) => {
    if (voto.votos > acta.totalSufragantes) {
      agregar(['votos', i, 'votos'], 'votos_mayor_que_total', MENSAJES_ACTA.votosMayorQueTotal);
    }
  });

  // 5. Σ votos de las listas + nulos + blancos = total de sufragantes (igualdad exacta).
  const suma = acta.votos.reduce((acc, v) => acc + v.votos, 0) + acta.votosNulos + acta.votosBlancos;
  if (suma !== acta.totalSufragantes) {
    agregar(['totalSufragantes'], 'suma_no_cuadra', MENSAJES_ACTA.sumaNoCuadra(suma, acta.totalSufragantes));
  }

  return violaciones;
}
