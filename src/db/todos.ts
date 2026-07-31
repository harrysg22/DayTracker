import { and, asc, eq, gte, isNull, lt, lte } from 'drizzle-orm';
import type { AnyDb, DataLayerDeps } from './dataLayer';
import { defaultDeps } from './dataLayer';
import { NotFoundError } from './errors';
import { todos } from './schema';
import type { Todo } from './schema';

/**
 * Fase 3 — to-dos. Misma forma que createCategoryLayer: nada de SQL en pantallas,
 * reloj e ids inyectados por `deps`, borrado suave, y toda lectura filtrando
 * `deletedAtMs is null`.
 *
 * Dos reglas que viven aquí y no en la UI:
 *
 *  1. La fecha es de pared ('YYYY-MM-DD'). Nunca se guarda un offset relativo
 *     ("mañana"): mañana significaría otra cosa mañana.
 *  2. "Overdue" es una consulta (`dueDate < today AND done = 0`), no un job que
 *     reescribe fechas. La intención original del usuario es dato.
 */
export interface CreateTodoInput {
  text: string;
  dueDate: string;
  categoryId?: string | null;
}

export interface UpdateTodoPatch {
  text?: string;
  categoryId?: string | null;
  dueDate?: string;
  sortOrder?: number;
}

export function createTodoLayer(db: AnyDb, deps: DataLayerDeps = defaultDeps) {
  const notDeleted = isNull(todos.deletedAtMs);

  async function getOrThrow(id: string): Promise<Todo> {
    const rows = await db
      .select()
      .from(todos)
      .where(and(eq(todos.id, id), notDeleted))
      .limit(1);
    const row = rows[0] as Todo | undefined;
    if (!row) throw new NotFoundError('todo', id);
    return row;
  }

  /** Todo lo que la pantalla necesita: un rango de fechas, ordenado. */
  async function listByDateRange(from: string, to: string): Promise<Todo[]> {
    return (await db
      .select()
      .from(todos)
      .where(and(notDeleted, gte(todos.dueDate, from), lte(todos.dueDate, to)))
      .orderBy(asc(todos.dueDate), asc(todos.done), asc(todos.sortOrder))) as Todo[];
  }

  /** Sin terminar y con fecha anterior a hoy. */
  async function listOverdue(today: string): Promise<Todo[]> {
    return (await db
      .select()
      .from(todos)
      .where(and(notDeleted, lt(todos.dueDate, today), eq(todos.done, 0)))
      .orderBy(asc(todos.dueDate), asc(todos.sortOrder))) as Todo[];
  }

  async function create(input: CreateTodoInput): Promise<Todo> {
    const now = deps.now();
    const row: Todo = {
      id: deps.genId(),
      text: input.text.trim(),
      categoryId: input.categoryId ?? null,
      dueDate: input.dueDate,
      done: 0,
      doneAtMs: null,
      // El orden de inserción ES el orden de la lista: monótono y estable.
      sortOrder: now,
      updatedAtMs: now,
      deletedAtMs: null,
    };
    await db.insert(todos).values(row);
    return row;
  }

  async function update(id: string, patch: UpdateTodoPatch): Promise<Todo> {
    const existing = await getOrThrow(id);
    const updatedAtMs = deps.now();
    const next = {
      text: patch.text !== undefined ? patch.text.trim() : existing.text,
      // `categoryId` puede ponerse a null a propósito, de ahí el hasOwnProperty.
      categoryId: Object.prototype.hasOwnProperty.call(patch, 'categoryId')
        ? patch.categoryId ?? null
        : existing.categoryId,
      dueDate: patch.dueDate ?? existing.dueDate,
      sortOrder: patch.sortOrder ?? existing.sortOrder,
      updatedAtMs,
    };
    await db.update(todos).set(next).where(eq(todos.id, id));
    return { ...existing, ...next } as Todo;
  }

  /**
   * Completar un vencido lo trae a hoy, para que salga de Overdue y aparezca
   * en la lista de completadas del día. Descompletar no toca la fecha.
   */
  async function toggleDone(id: string, done: boolean, today: string): Promise<void> {
    const existing = await getOrThrow(id);
    const now = deps.now();
    await db
      .update(todos)
      .set({
        done: done ? 1 : 0,
        doneAtMs: done ? now : null,
        dueDate: done && existing.dueDate < today ? today : existing.dueDate,
        updatedAtMs: now,
      })
      .where(eq(todos.id, id));
  }

  async function softDelete(id: string): Promise<void> {
    await getOrThrow(id);
    const now = deps.now();
    await db.update(todos).set({ deletedAtMs: now, updatedAtMs: now }).where(eq(todos.id, id));
  }

  /** Cuando se borra una categoría: los to-dos sobreviven sin ella. */
  async function clearCategory(categoryId: string): Promise<void> {
    await db
      .update(todos)
      .set({ categoryId: null, updatedAtMs: deps.now() })
      .where(and(eq(todos.categoryId, categoryId), notDeleted));
  }

  return {
    getTodo: getOrThrow,
    listByDateRange,
    listOverdue,
    create,
    update,
    toggleDone,
    softDelete,
    clearCategory,
  };
}

export type TodoLayer = ReturnType<typeof createTodoLayer>;
