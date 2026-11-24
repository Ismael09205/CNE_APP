// Esquema Zod de los resultados del acta (ADR-12). El formulario y RegistrarActa usan el mismo.
// Los campos solo verifican el tipo; TODAS las reglas viven en validarResultadosActa y corren
// en superRefine (en Zod 4 el superRefine del objeto no corre si un campo interno falla).
import { z } from 'zod';

import { MENSAJES_ACTA, validarResultadosActa, type OpcionesValidacionActa } from '../rules/acta.rules';

const numero = z.number({ error: MENSAJES_ACTA.entero });

export function crearActaSchema(opciones: OpcionesValidacionActa) {
  return z
    .object({
      votosNulos: numero,
      votosBlancos: numero,
      totalSufragantes: numero,
      votos: z.array(z.object({ candidaturaId: z.string(), votos: numero })),
    })
    .superRefine((acta, ctx) => {
      for (const violacion of validarResultadosActa(acta, opciones)) {
        ctx.addIssue({ code: 'custom', path: [...violacion.campo], message: violacion.mensaje });
      }
    });
}

export type ResultadosActa = z.output<ReturnType<typeof crearActaSchema>>;
