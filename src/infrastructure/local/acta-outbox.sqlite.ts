// ActaOutboxRepository sobre la base local cifrada (ADR-15, F6-3).
import type { SQLiteDatabase } from 'expo-sqlite';

import type { Acta } from '@/domain/entities/acta';
import type { EnvioActa } from '@/domain/entities/envio-acta';
import type { ActaOutboxRepository } from '@/domain/repositories/acta-outbox.repository';
import type { Dignidad } from '@/domain/value-objects/dignidad';
import { ESTADOS_REINTENTABLES } from '@/domain/entities/envio-acta';
import type { EstadoEnvio } from '@/domain/value-objects/estado-envio';

type FilaOutbox = {
  id: string;
  acta: string;
  estado: EstadoEnvio;
  intentos: number;
  ultimo_error: string | null;
  actualizada_en: string;
};

/** JSON del acta con fechas en ISO 8601. */
export const serializarActa = (acta: Acta): string => JSON.stringify(acta);

export function deserializarActa(json: string): Acta {
  const a = JSON.parse(json) as Acta & { confirmadaEn: string; evidencia: Acta['evidencia'] & { capturadaEn: string } };
  return Object.freeze({
    ...a,
    confirmadaEn: new Date(a.confirmadaEn),
    votos: Object.freeze(a.votos.map((v) => Object.freeze({ ...v }))),
    evidencia: Object.freeze({ ...a.evidencia, capturadaEn: new Date(a.evidencia.capturadaEn) }),
  });
}

const aEnvio = (f: FilaOutbox): EnvioActa => ({
  acta: deserializarActa(f.acta),
  estado: f.estado,
  intentos: f.intentos,
  ultimoError: f.ultimo_error,
  actualizadoEn: new Date(f.actualizada_en),
});

const COLUMNAS = 'id, acta, estado, intentos, ultimo_error, actualizada_en';

export class ActaOutboxSqlite implements ActaOutboxRepository {
  constructor(private readonly db: () => Promise<SQLiteDatabase>) {}

  async existeParaMesaYDignidad(mesaId: string, dignidad: Dignidad): Promise<boolean> {
    const db = await this.db();
    const fila = await db.getFirstAsync('select 1 from actas_outbox where mesa_id = ? and dignidad = ?', mesaId, dignidad);
    return fila != null;
  }

  async guardarYEncolar(acta: Acta): Promise<void> {
    const db = await this.db();
    const ahora = new Date().toISOString();
    // Una sola fila con el acta, la ruta de la foto y el estado: atómica (S-08).
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `insert into actas_outbox (id, veedor_id, mesa_id, dignidad, acta, estado, intentos, ultimo_error, creada_en, actualizada_en)
         values (?, ?, ?, ?, ?, 'pendiente', 0, null, ?, ?)`,
        acta.id,
        acta.veedorId,
        acta.mesaId,
        acta.dignidad,
        serializarActa(acta),
        ahora,
        ahora,
      );
    });
  }

  async listarPorEnviar(veedorId: string): Promise<EnvioActa[]> {
    const db = await this.db();
    const marcas = ESTADOS_REINTENTABLES.map(() => '?').join(', ');
    const filas = await db.getAllAsync<FilaOutbox>(
      `select ${COLUMNAS} from actas_outbox where veedor_id = ? and estado in (${marcas}) order by creada_en`,
      veedorId,
      ...ESTADOS_REINTENTABLES,
    );
    return filas.map(aEnvio);
  }

  async listarPorMesa(mesaId: string): Promise<EnvioActa[]> {
    const db = await this.db();
    const filas = await db.getAllAsync<FilaOutbox>(`select ${COLUMNAS} from actas_outbox where mesa_id = ? order by creada_en`, mesaId);
    return filas.map(aEnvio);
  }

  async marcar(
    actaId: string,
    estado: EstadoEnvio,
    cambios: { readonly error?: string | null; readonly contarIntento?: boolean } = {},
  ): Promise<void> {
    const db = await this.db();
    await db.runAsync(
      `update actas_outbox
          set estado = ?,
              ultimo_error = case when ? then ? else ultimo_error end,
              intentos = intentos + ?,
              actualizada_en = ?
        where id = ?`,
      estado,
      cambios.error !== undefined ? 1 : 0,
      cambios.error ?? null,
      cambios.contarIntento ? 1 : 0,
      new Date().toISOString(),
      actaId,
    );
  }
}
