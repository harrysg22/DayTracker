import { db, ensureDbReady, onDbReopen } from "./client";
import { createDataLayer, type DataLayer } from "./dataLayer";
import { createTodoLayer, type TodoLayer } from "./todos";
import { createEventLayer, type EventLayer } from "./events";

export { ensureDbReady };
export * from "./errors";
export * from "./dateUtils";
export * from "./csv";
export type { Category, Entry, DailyRollup, NewCategory, NewEntry, Todo, NewTodo, PlanEvent, NewPlanEvent } from "./schema";
export type { CreateEntryInput, UpdateEntryPatch, DataLayer } from "./dataLayer";
export type { CreateTodoInput, UpdateTodoPatch, TodoLayer } from "./todos";
export type { CreateEventInput, UpdateEventPatch, EventLayer } from "./events";

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

let _todoLayer: TodoLayer | null = null;
export const todoLayer = new Proxy({} as TodoLayer, {
  get(_t, prop) {
    if (!_todoLayer) _todoLayer = createTodoLayer(db as any);
    return (_todoLayer as any)[prop];
  },
});

let _eventLayer: EventLayer | null = null;
export const eventLayer = new Proxy({} as EventLayer, {
  get(_t, prop) {
    if (!_eventLayer) _eventLayer = createEventLayer(db as any);
    return (_eventLayer as any)[prop];
  },
});

onDbReopen(() => {
  _dataLayer = null;
  _todoLayer = null;
  _eventLayer = null;
});

export { exportCSV, exportBackup, restoreBackup } from "./io";
