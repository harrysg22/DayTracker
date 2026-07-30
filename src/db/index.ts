import { db, ensureDbReady } from "./client";
import { createDataLayer } from "./dataLayer";

export { ensureDbReady };
export * from "./errors";
export * from "./dateUtils";
export * from "./csv";
export type { Category, Entry, DailyRollup, NewCategory, NewEntry } from "./schema";
export type { CreateEntryInput, UpdateEntryPatch, DataLayer } from "./dataLayer";

/**
 * Instancia singleton de la capa de datos para toda la app. Toda
 * escritura pasa por aquí — nunca SQL suelto en componentes.
 */
export const dataLayer = createDataLayer(db as any);

export { exportCSV, exportBackup, restoreBackup } from "./io";
