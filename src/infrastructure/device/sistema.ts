// Identificadores y reloj del dispositivo.
import { randomUUID } from 'expo-crypto';

import type { GeneradorId } from '@/application/ports/generador-id.port';
import type { Reloj } from '@/application/ports/reloj.port';

/** UUID v4 del cliente: identifica el acta desde que se confirma (idempotencia, ADR-15). */
export const generadorIdExpo: GeneradorId = { uuid: () => randomUUID() };

export const relojSistema: Reloj = { ahora: () => new Date() };
