// ─────────────────────────────────────────────────────────────────────────────
// PEGAR EN src/db/index.ts
// Mismo patrón que `dataLayer`: Proxy perezoso (nada toca la base antes de
// ensureDbReady) + reset en onDbReopen (para que restoreBackup no deje las
// capas apuntando a una conexión cerrada).
// ─────────────────────────────────────────────────────────────────────────────

// 1) Añadir a los imports de arriba:
import { createTodoLayer, type TodoLayer } from "./todos";
import { createEventLayer, type EventLayer } from "./events";

// 2) Añadir a los re-exports de tipos:
export type { Todo, NewTodo, PlanEvent, NewPlanEvent } from "./schema";
export type { CreateTodoInput, UpdateTodoPatch, TodoLayer } from "./todos";
export type { CreateEventInput, UpdateEventPatch, EventLayer } from "./events";

// 3) Añadir después de la declaración de `dataLayer`:
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

// 4) Y en el onDbReopen que ya existe, añadir los dos resets:
onDbReopen(() => {
  _dataLayer = null;
  _todoLayer = null;
  _eventLayer = null;
});
