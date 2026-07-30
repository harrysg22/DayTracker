import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

export type TestDb = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Crea una base de datos SQLite (better-sqlite3) para tests de Jest,
 * aplicando las mismas migraciones versionadas que usa la app en runtime
 * (drizzle-orm/expo-sqlite lee el mismo .sql en el device).
 *
 * Por defecto vive en memoria. Pasar una ruta de archivo real permite
 * simular un reinicio de la app: cerrar la conexión y abrir una nueva
 * contra el mismo archivo, sin depender de ningún estado en memoria.
 */
export function createTestDb(dbPath: string = ":memory:"): { db: TestDb; sqlite: Database.Database } {
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });
  migrate(db, {
    migrationsFolder: path.join(__dirname, "migrations"),
  });

  return { db, sqlite };
}
