import type { Acta } from '@/domain/entities/acta';
import type { Dignidad } from '@/domain/value-objects/dignidad';

// Envío al servidor (F10, ADR-15). Supabase Storage + RPC `registrar_acta` en infrastructure.

/** Falla transitoria (sin red, tiempo agotado, servidor caído): el envío se reintenta. */
export class FallaRed extends Error {
  constructor(mensaje = 'Sin conexión con el servidor') {
    super(mensaje);
    this.name = 'FallaRed';
  }
}

/** Sesión vencida o ausente: hay que volver a ingresar antes de seguir enviando. */
export class SesionVencida extends Error {
  constructor() {
    super('La sesión terminó');
    this.name = 'SesionVencida';
  }
}

export type ResultadoSubidaFoto =
  /** La foto quedó en Storage. */
  | 'subida'
  /** Ya había una foto en la ruta (un intento anterior, o una foto huérfana de otro veedor). */
  | 'ya_existe'
  /** Storage no permite subirla (por ejemplo, el acta ya existe en el servidor). */
  | 'sin_permiso';

/** Rechazos definitivos de la RPC (hint estable) y reglas del acta del trigger. */
export type RechazoRegistro =
  | 'no_autorizado'
  | 'datos_invalidos'
  | 'hora_invalida'
  | 'fuera_de_vigencia'
  | 'foto_faltante'
  | 'candidatura_desconocida'
  | 'candidatura_faltante'
  | 'total_mayor_que_maximo'
  | 'votos_mayor_que_total'
  | 'suma_no_cuadra'
  | 'rechazo_desconocido';

export type RespuestaRegistro =
  | { readonly tipo: 'guardada' | 'ya_guardada' | 'conflicto' }
  | { readonly tipo: 'rechazada'; readonly motivo: RechazoRegistro };

export interface ServidorActas {
  /** Sube la foto a `{mesa_id}/{dignidad}.jpg`. `reemplazar` = upsert de una foto huérfana (F6-6). */
  subirFoto(acta: Acta, opciones: { readonly reemplazar: boolean }): Promise<ResultadoSubidaFoto>;
  /** RPC transaccional, solo INSERT (ADR-14). */
  registrar(acta: Acta): Promise<RespuestaRegistro>;
  /** Dignidades que ya tienen acta en el servidor para la mesa (lo que RLS deja ver). */
  dignidadesRegistradas(mesaId: string): Promise<Dignidad[]>;
}
