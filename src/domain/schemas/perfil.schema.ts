// Esquema Zod del perfil (ADR-04). El mismo esquema lo usan el formulario (TanStack Form)
// y el caso de uso CrearCuenta.
import { z } from 'zod';

import { MENSAJES_CEDULA, validarCedula } from '../rules/cedula.mod10';
import {
  LONGITUD_NOMBRE,
  MENSAJES_PERFIL,
  normalizarNombre,
  PATRON_NOMBRE,
  PATRON_TELEFONO,
} from '../rules/perfil.rules';

const nombre = z
  .string({ error: MENSAJES_PERFIL.obligatorio })
  .transform(normalizarNombre)
  .pipe(
    z
      .string()
      .min(1, { error: MENSAJES_PERFIL.obligatorio })
      .min(LONGITUD_NOMBRE.min, { error: MENSAJES_PERFIL.nombreLongitud })
      .max(LONGITUD_NOMBRE.max, { error: MENSAJES_PERFIL.nombreLongitud })
      .regex(PATRON_NOMBRE, { error: MENSAJES_PERFIL.nombreCaracteres }),
  );

export const cedulaSchema = z
  .string({ error: MENSAJES_PERFIL.obligatorio })
  .trim()
  .superRefine((valor, ctx) => {
    const resultado = validarCedula(valor);
    if (!resultado.valida) ctx.addIssue({ code: 'custom', message: MENSAJES_CEDULA[resultado.motivo] });
  });

export const datosPersonalesSchema = z.object({
  cedula: cedulaSchema,
  nombres: nombre,
  apellidos: nombre,
  telefono: z
    .string({ error: MENSAJES_PERFIL.obligatorio })
    .trim()
    .regex(PATRON_TELEFONO, { error: MENSAJES_PERFIL.telefono }),
  correo: z
    .string({ error: MENSAJES_PERFIL.obligatorio })
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: MENSAJES_PERFIL.correo })),
});

export type DatosPersonales = z.output<typeof datosPersonalesSchema>;

/** Roles que se pueden crear desde la app. El primer coordinador provincial se crea fuera de la app. */
export const ROLES_CREABLES = ['coordinador_recinto', 'veedor'] as const;

// F1: el veedor queda asociado a su recinto (veedores_recinto, S-06).
// El coordinador de recinto recibe su recinto aparte, con AsignarCoordinador (F6, ADR-08).
export const nuevaCuentaSchema = z.discriminatedUnion('rol', [
  datosPersonalesSchema.extend({
    rol: z.literal('veedor'),
    recintoId: z.string({ error: MENSAJES_PERFIL.recintoObligatorio }).min(1, { error: MENSAJES_PERFIL.recintoObligatorio }),
  }),
  datosPersonalesSchema.extend({ rol: z.literal('coordinador_recinto') }),
]);

export type NuevaCuenta = z.output<typeof nuevaCuentaSchema>;
export type NuevaCuentaInput = z.input<typeof nuevaCuentaSchema>;
