import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { db, expoDb, reopenDb } from "./client";
import { buildCsv } from "./csv";
import type { DataLayer } from "./dataLayer";
import { categories } from "./schema";

const DB_FILE_NAME = "ledger.db";

/**
 * CSV legible de un rango (por defecto, toda la historia). Usa
 * expo-file-system para escribir a caché y expo-sharing para exponerlo:
 * ninguna otra capa debe tocar el sistema de archivos directamente.
 */
export async function exportCSV(
  dataLayer: DataLayer,
  range: { from: string; to: string } = { from: "0000-01-01", to: "9999-12-31" }
): Promise<{ uri: string }> {
  const rows = await dataLayer.getRange(range.from, range.to);
  const cats = await db.select().from(categories);
  const csv = buildCsv(rows, new Map(cats.map((c) => [c.id, c])));

  const file = new File(Paths.cache, `ledger-export-${Date.now()}.csv`);
  file.write(csv);

  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri);
  return { uri: file.uri };
}

/**
 * Backup consistente vía VACUUM INTO — la única forma correcta de
 * respaldar SQLite con WAL activo (copiar el archivo a mano puede
 * capturar un WAL a medio aplicar y corromper el backup).
 */
export async function exportBackup(dataLayer: DataLayer): Promise<{ uri: string }> {
  const file = new File(Paths.cache, `ledger-backup-${Date.now()}.db`);
  await dataLayer.vacuumInto(file.uri);
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri);
  return { uri: file.uri };
}

/**
 * Restauración destructiva: reemplaza el archivo de base de datos actual
 * por el backup. La UI (Fase 5) DEBE pedir confirmación explícita antes
 * de llamar a esto — no hay vuelta atrás.
 *
 * Cierra la conexión antes de copiar (escribir encima de un archivo con la
 * conexión abierta puede corromper el WAL) y reopenDb() la reabre después
 * sobre los datos restaurados — no hace falta recargar la app.
 */
export async function restoreBackup(uri: string): Promise<void> {
  await expoDb.closeAsync();

  const sqliteDir = new Directory(Paths.document, "SQLite");
  const target = new File(sqliteDir, DB_FILE_NAME);
  const source = new File(uri);

  await source.copy(target, { overwrite: true });
  await reopenDb();
}
