import { openDatabaseSync } from "expo-sqlite";
import { drizzle } from "drizzle-orm/expo-sqlite";
import { migrate } from "drizzle-orm/expo-sqlite/migrator";
import migrations from "./migrations/migrations";
import * as schema from "./schema";

const DB_NAME = "ledger.db";

export const expoDb = openDatabaseSync(DB_NAME);

export const db = drizzle(expoDb, { schema });

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
