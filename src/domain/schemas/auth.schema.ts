// Esquemas de los formularios de acceso (F2, F3). Los usan la UI y los casos de uso.
import { z } from 'zod';

import { LONGITUD_CLAVE, MENSAJES_CLAVE, PATRON_CODIGO, tieneLetra, tieneNumero } from '../rules/clave.rules';
import { MENSAJES_PERFIL } from '../rules/perfil.rules';

const correo = z
  .string({ error: MENSAJES_PERFIL.obligatorio })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: MENSAJES_PERFIL.correo }));

export const claveNuevaSchema = z
  .string({ error: MENSAJES_CLAVE.obligatoria })
  .min(LONGITUD_CLAVE.min, { error: MENSAJES_CLAVE.longitud })
  .max(LONGITUD_CLAVE.max, { error: MENSAJES_CLAVE.larga })
  .refine((c) => tieneLetra(c) && tieneNumero(c), { error: MENSAJES_CLAVE.letrasYNumeros });

const codigo = z.string({ error: MENSAJES_CLAVE.codigo }).trim().regex(PATRON_CODIGO, { error: MENSAJES_CLAVE.codigo });

export const inicioSesionSchema = z.object({
  correo,
  clave: z.string({ error: MENSAJES_CLAVE.obligatoria }).min(1, { error: MENSAJES_CLAVE.obligatoria }),
});
export type InicioSesionInput = z.input<typeof inicioSesionSchema>;

export const solicitudCodigoSchema = z.object({ correo });
export type SolicitudCodigoInput = z.input<typeof solicitudCodigoSchema>;

/** Código del correo + clave nueva repetida (primer ingreso y recuperación). */
export const codigoYClaveSchema = z
  .object({ codigo, clave: claveNuevaSchema, confirmacion: z.string() })
  .refine((d) => d.clave === d.confirmacion, { path: ['confirmacion'], error: MENSAJES_CLAVE.noCoinciden });
export type CodigoYClaveInput = z.input<typeof codigoYClaveSchema>;
