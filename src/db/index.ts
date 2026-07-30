import { db, ensureDbReady, onDbReopen } from "./client";
import { createDataLayer, type DataLayer } from "./dataLayer";

export { ensureDbReady };
export * from "./errors";
export * from "./dateUtils";
export * from "./csv";
export type { Category, Entry, DailyRollup, NewCategory, NewEntry } from "./schema";
export type { CreateEntryInput, UpdateEntryPatch, DataLayer } from "./dataLayer";

let _dataLayer: DataLayer | null = null;
/**
 * Instancia (lazy, reconstruible) de la capa de datos para toda la app.
 * Toda escritura pasa por aquí — nunca SQL suelto en componentes. Se
 * reconstruye tras un reopenDb() (p. ej. restoreBackup) para no quedar
 * apuntando a una conexión cerrada.
 */
export const dataLayer = new Proxy({} as DataLayer, {
  get(_t, prop) {
    if (!_dataLayer) _dataLayer = createDataLayer(db as any);
    return (_dataLayer as any)[prop];
  },
});
onDbReopen(() => {
  _dataLayer = null;
});

export { exportCSV, exportBackup, restoreBackup } from "./io";
