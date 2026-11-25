// Base local cifrada (F6-3): Expo SQLite con SQLCipher (`useSQLCipher` en app.json).
// La llave (32 bytes aleatorios) vive en el almacén seguro del sistema (expo-secure-store)
// y nunca sale del teléfono. Sin la llave el archivo es ilegible.
import { getRandomBytes } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { File } from 'expo-file-system';
import { defaultDatabaseDirectory, openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

const NOMBRE_BASE = 'cne-local.db';
const CLAVE_LLAVE = 'cne.base_local.llave';

// Versión del esquema (PRAGMA user_version). Cada cambio agrega un paso, nunca edita uno anterior.
const MIGRACIONES: readonly string[] = [
  `create table actas_outbox (
     id             text primary key,
     veedor_id      text not null,
     mesa_id        text not null,
     dignidad       text not null check (dignidad in ('alcaldia', 'prefectura')),
     acta           text not null,
     estado         text not null check (estado in ('pendiente', 'enviando', 'guardada', 'error', 'conflicto')),
     intentos       integer not null default 0,
     ultimo_error   text,
     creada_en      text not null,
     actualizada_en text not null,
     unique (mesa_id, dignidad)
   );
   create index actas_outbox_veedor_estado_idx on actas_outbox (veedor_id, estado);
   create table cache (
     clave          text primary key,
     valor          text not null,
     actualizado_en text not null
   );`,
];

const aHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

async function llave(): Promise<string> {
  const guardada = await SecureStore.getItemAsync(CLAVE_LLAVE);
  if (guardada) return guardada;
  const nueva = aHex(getRandomBytes(32));
  await SecureStore.setItemAsync(CLAVE_LLAVE, nueva, {
    // Disponible tras el primer desbloqueo (el sincronizador puede correr con la pantalla bloqueada)
    // y nunca se copia a otro dispositivo.
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
  return nueva;
}

async function abrirConLlave(hex: string): Promise<SQLiteDatabase> {
  const db = await openDatabaseAsync(NOMBRE_BASE);
  // Llave cruda de 256 bits (sin derivación PBKDF2): formato x'…' de SQLCipher.
  await db.execAsync(`PRAGMA key = "x'${hex}'";`);
  try {
    // Con una llave incorrecta, la primera lectura falla ("file is not a database").
    await db.getFirstAsync('select count(*) from sqlite_master');
    return db;
  } catch (e) {
    await db.closeAsync().catch(() => undefined);
    throw e;
  }
}

async function migrar(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const fila = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const actual = fila?.user_version ?? 0;
  for (let v = actual; v < MIGRACIONES.length; v++) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRACIONES[v]);
      await db.execAsync(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

function apartarIlegible() {
  const sello = new Date().toISOString().replace(/[:.]/g, '-');
  for (const sufijo of ['', '-wal', '-shm']) {
    const dir = String(defaultDatabaseDirectory);
    const archivo = new File(`${dir.startsWith('file://') ? dir : `file://${dir}`}/${NOMBRE_BASE}${sufijo}`);
    if (archivo.exists) archivo.rename(`cne-local.ilegible-${sello}.db${sufijo}`);
  }
}

async function abrir(): Promise<SQLiteDatabase> {
  const hex = await llave();
  let db: SQLiteDatabase;
  try {
    db = await abrirConLlave(hex);
  } catch {
    // El archivo existe pero no se abre con esta llave (p. ej. restaurado de un respaldo sin el
    // almacén seguro). No se borra: se aparta con otro nombre para diagnóstico y se crea una nueva.
    apartarIlegible();
    db = await abrirConLlave(hex);
  }
  await migrar(db);
  return db;
}

let base: Promise<SQLiteDatabase> | null = null;

/** Conexión única a la base local (se abre la primera vez que se usa). */
export function baseLocal(): Promise<SQLiteDatabase> {
  base ??= abrir().catch((e) => {
    base = null; // permitir reintentar
    throw e;
  });
  return base;
}
