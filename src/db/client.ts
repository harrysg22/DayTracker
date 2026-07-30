import { openDatabaseSync } from "expo-sqlite";
import { drizzle } from "drizzle-orm/expo-sqlite";
import { migrate } from "drizzle-orm/expo-sqlite/migrator";
import migrations from "./migrations/migrations";
import * as schema from "./schema";

const DB_NAME = "ledger.db";

export let expoDb = openDatabaseSync(DB_NAME);

export let db = drizzle(expoDb, { schema });

let readyPromise: Promise<void> | null = null;

/**
 * Activa WAL + foreign keys y aplica migraciones pendientes.
 * Debe esperarse (await) antes de usar `db` en cualquier pantalla.
 * Es idempotente: llamadas repetidas reutilizan la misma promesa.
 */
export function ensureDbReady(): Promise<void> {
  if (!readyPromise) {
    readyPromise = (async () => {
      // journal_mode y foreign_keys son PRAGMAs de conexión: deben
      // fijarse aquí, no dejarse a la lógica de la app.
      await expoDb.execAsync("PRAGMA journal_mode = WAL;");
      await expoDb.execAsync("PRAGMA foreign_keys = ON;");
      await migrate(db, migrations);
    })();
  }
  return readyPromise;
}

const reopenSubscribers = new Set<() => void>();

/** Se llama cuando `db`/`expoDb` se reemplazan (p. ej. tras restoreBackup),
 * para que quien tenga cacheada una capa construida sobre la conexión vieja
 * la reconstruya contra la nueva. */
export function onDbReopen(fn: () => void): () => void {
  reopenSubscribers.add(fn);
  return () => reopenSubscribers.delete(fn);
}

/**
 * Cierra la conexión actual (si sigue abierta) y abre una nueva sobre el
 * mismo archivo, reaplicando PRAGMAs y migraciones. Es lo que permite que
 * la app siga funcionando tras un restoreBackup() sin recargarse.
 */
export async function reopenDb(): Promise<void> {
  await expoDb.closeAsync().catch(() => {});
  expoDb = openDatabaseSync(DB_NAME);
  db = drizzle(expoDb, { schema });
  readyPromise = null;
  await ensureDbReady();
  reopenSubscribers.forEach((fn) => fn());
}
