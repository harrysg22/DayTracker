// ─────────────────────────────────────────────────────────────────────────────
// PEGAR EN src/ui/hooks.ts (al final del archivo)
// Mismo patrón que useDay / useRange: lee de disco, se invalida por `revision`,
// sin caché y sin estado en memoria.
// ─────────────────────────────────────────────────────────────────────────────

// 1) Añadir a los imports de arriba:
//      import { dataLayer, eventLayer, todoLayer } from '../db';
//      import type { Category, Entry, PlanEvent, Todo } from '../db/schema';

/** To-dos en un rango de fechas ('YYYY-MM-DD'), incluidos los vencidos. */
export function useTodos(from: string, to: string, revision: number, enabled = true) {
  const [todos, setTodos] = useState<Todo[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    todoLayer
      .listByDateRange(from, to)
      .then((rows) => alive && setTodos(rows))
      .catch((err) => console.warn('listTodos failed', err));
    return () => {
      alive = false;
    };
  }, [from, to, revision, enabled]);
  return todos;
}

/** Eventos planeados en un rango de fechas. */
export function useEvents(from: string, to: string, revision: number, enabled = true) {
  const [events, setEvents] = useState<PlanEvent[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    eventLayer
      .listByRange(from, to)
      .then((rows) => alive && setEvents(rows))
      .catch((err) => console.warn('listEvents failed', err));
    return () => {
      alive = false;
    };
  }, [from, to, revision, enabled]);
  return events;
}
