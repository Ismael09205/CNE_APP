// F5 — Alta de recintos y mesas (ADR-07, D-30, D-31, D-32).
// Deben coincidir con los CHECK/RLS de `recintos` y con la RPC `agregar_mesas`.
import { z } from 'zod';

export const PRECISION_MAXIMA_M = 50; // D-31
export const MAX_MESAS_POR_RANGO = 60;

export const MENSAJES_TERRITORIO = {
  parroquia: 'Elija la parroquia.',
  codigo: 'Escriba el código del recinto (solo números).',
  nombre: 'Escriba el nombre del recinto.',
  zona: 'Escriba el código de zona (0 si no tiene).',
  ubicacionFalta: 'Tome la ubicación con el GPS estando en el recinto.',
  ubicacionImprecisa: `La ubicación tiene poca precisión. Debe ser de ${PRECISION_MAXIMA_M} metros o mejor: salga a un lugar abierto e intente de nuevo.`,
  ubicacionSimulada: 'La ubicación del teléfono es simulada. Desactive las apps de ubicación falsa.',
  numero: 'Escriba un número de junta mayor que 0.',
  rango: 'El número final debe ser igual o mayor que el inicial.',
  rangoLargo: `Puede agregar hasta ${MAX_MESAS_POR_RANGO} juntas a la vez.`,
  sexo: 'Elija Femenino o Masculino.',
} as const;

export const ubicacionGpsSchema = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    precisionM: z.number().min(0),
    simulada: z.boolean(),
  }, { error: MENSAJES_TERRITORIO.ubicacionFalta })
  .superRefine((u, ctx) => {
    if (u.simulada) ctx.addIssue({ code: 'custom', message: MENSAJES_TERRITORIO.ubicacionSimulada });
    else if (u.precisionM > PRECISION_MAXIMA_M) ctx.addIssue({ code: 'custom', message: MENSAJES_TERRITORIO.ubicacionImprecisa });
  });
export type UbicacionGps = z.output<typeof ubicacionGpsSchema>;

const textoOpcional = z
  .string()
  .transform((v) => v.trim().replace(/\s+/g, ' '))
  .transform((v) => (v === '' ? null : v));

export const nuevoRecintoSchema = z.object({
  parroquiaId: z.number({ error: MENSAJES_TERRITORIO.parroquia }).int().positive({ error: MENSAJES_TERRITORIO.parroquia }),
  codigo: z.string({ error: MENSAJES_TERRITORIO.codigo }).trim().regex(/^[0-9]{1,10}$/, { error: MENSAJES_TERRITORIO.codigo }),
  nombre: z
    .string({ error: MENSAJES_TERRITORIO.nombre })
    .transform((v) => v.trim().replace(/\s+/g, ' '))
    .pipe(z.string().min(3, { error: MENSAJES_TERRITORIO.nombre }).max(150, { error: MENSAJES_TERRITORIO.nombre })),
  codigoZona: z.number({ error: MENSAJES_TERRITORIO.zona }).int({ error: MENSAJES_TERRITORIO.zona }).min(0, { error: MENSAJES_TERRITORIO.zona }),
  nombreZona: textoOpcional,
  direccion: textoOpcional,
  dificilAcceso: z.boolean(),
  sinConectividad: z.boolean(),
  ubicacion: ubicacionGpsSchema,
});
export type NuevoRecinto = z.output<typeof nuevoRecintoSchema>;
export type NuevoRecintoInput = z.input<typeof nuevoRecintoSchema>;

export const rangoMesasSchema = z
  .object({
    sexo: z.enum(['F', 'M'], { error: MENSAJES_TERRITORIO.sexo }),
    desde: z.number({ error: MENSAJES_TERRITORIO.numero }).int({ error: MENSAJES_TERRITORIO.numero }).min(1, { error: MENSAJES_TERRITORIO.numero }),
    hasta: z.number({ error: MENSAJES_TERRITORIO.numero }).int({ error: MENSAJES_TERRITORIO.numero }).min(1, { error: MENSAJES_TERRITORIO.numero }),
  })
  .superRefine((r, ctx) => {
    if (r.hasta < r.desde) ctx.addIssue({ code: 'custom', path: ['hasta'], message: MENSAJES_TERRITORIO.rango });
    else if (r.hasta - r.desde >= MAX_MESAS_POR_RANGO) ctx.addIssue({ code: 'custom', path: ['hasta'], message: MENSAJES_TERRITORIO.rangoLargo });
  });
export type RangoMesas = z.output<typeof rangoMesasSchema>;
export type RangoMesasInput = z.input<typeof rangoMesasSchema>;
