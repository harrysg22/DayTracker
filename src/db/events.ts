import { and, asc, eq, gte, isNull, lte } from 'drizzle-orm';
import type { AnyDb, DataLayerDeps } from './dataLayer';
import { defaultDeps } from './dataLayer';
import { NotFoundError } from './errors';
import { events } from './schema';
import type { PlanEvent } from './schema';

/**
 * Fase 3 — eventos planeados (la pestaña Calendar).
 *
 * Diferencia clave contra `entries`, y la razón de que sean dos tablas:
 *
 *  - `entries` registra lo que PASÓ: un instante absoluto (epoch ms). No se
 *    pueden solapar y la base lo garantiza.
 *  - `events` registra una INTENCIÓN: fecha de pared + minuto del día. Una cena
 *    a las 7 PM sigue siendo a las 7 PM aunque cambie el huso o el DST, y dos
 *    eventos pueden solaparse sin problema.
 *
 * `tzOffsetMin` se guarda solo para poder convertir a instante absoluto más
 * tarde (recordatorios): utcMs = localMidnight + startMinute*60000 + tz*60000.
 */
const MIN_DURATION = 15;
const MAX_DURATION = 720;
const MAX_START = 1425; // 23:45

function clampStart(v: number): number {
  return Math.max(0, Math.min(MAX_START, Math.round(v)));
}
function clampDuration(v: number): number {
  return Math.max(MIN_DURATION, Math.min(MAX_DURATION, Math.round(v)));
}

export interface CreateEventInput {
  title: string;
  localDate: string;
  startMinute: number;
  durationMinutes: number;
  categoryId?: string | null;
  note?: string | null;
  tzOffsetMin?: number;
}

export interface UpdateEventPatch {
  title?: string;
  localDate?: string;
  startMinute?: number;
  durationMinutes?: number;
  categoryId?: string | null;
  note?: string | null;
}

export function createEventLayer(db: AnyDb, deps: DataLayerDeps = defaultDeps) {
  const notDeleted = isNull(events.deletedAtMs);

  async function getOrThrow(id: string): Promise<PlanEvent> {
    const rows = await db
      .select()
      .from(events)
      .where(and(eq(events.id, id), notDeleted))
      .limit(1);
    const row = rows[0] as PlanEvent | undefined;
    if (!row) throw new NotFoundError('event', id);
    return row;
  }

  async function listByDate(localDate: string): Promise<PlanEvent[]> {
    return (await db
      .select()
      .from(events)
      .where(and(notDeleted, eq(events.localDate, localDate)))
      .orderBy(asc(events.startMinute))) as PlanEvent[];
  }

  /** El rango que pinta la semana o el mes completo, de una sola consulta. */
  async function listByRange(from: string, to: string): Promise<PlanEvent[]> {
    return (await db
      .select()
      .from(events)
      .where(and(notDeleted, gte(events.localDate, from), lte(events.localDate, to)))
      .orderBy(asc(events.localDate), asc(events.startMinute))) as PlanEvent[];
  }

  async function create(input: CreateEventInput): Promise<PlanEvent> {
    const now = deps.now();
    const row: PlanEvent = {
      id: deps.genId(),
      title: input.title.trim(),
      categoryId: input.categoryId ?? null,
      localDate: input.localDate,
      startMinute: clampStart(input.startMinute),
      durationMinutes: clampDuration(input.durationMinutes),
      tzOffsetMin: input.tzOffsetMin ?? deps.getTzOffsetMin(),
      note: input.note ?? null,
      updatedAtMs: now,
      deletedAtMs: null,
    };
    await db.insert(events).values(row);
    return row;
  }

  async function update(id: string, patch: UpdateEventPatch): Promise<PlanEvent> {
    const existing = await getOrThrow(id);
    const updatedAtMs = deps.now();
    const next = {
      title: patch.title !== undefined ? patch.title.trim() : existing.title,
      localDate: patch.localDate ?? existing.localDate,
      startMinute: patch.startMinute !== undefined ? clampStart(patch.startMinute) : existing.startMinute,
      durationMinutes:
        patch.durationMinutes !== undefined ? clampDuration(patch.durationMinutes) : existing.durationMinutes,
      categoryId: Object.prototype.hasOwnProperty.call(patch, 'categoryId')
        ? patch.categoryId ?? null
        : existing.categoryId,
      note: Object.prototype.hasOwnProperty.call(patch, 'note') ? patch.note ?? null : existing.note,
      updatedAtMs,
    };
    await db.update(events).set(next).where(eq(events.id, id));
    return { ...existing, ...next } as PlanEvent;
  }

  async function softDelete(id: string): Promise<void> {
    await getOrThrow(id);
    const now = deps.now();
    await db.update(events).set({ deletedAtMs: now, updatedAtMs: now }).where(eq(events.id, id));
  }

  async function clearCategory(categoryId: string): Promise<void> {
    await db
      .update(events)
      .set({ categoryId: null, updatedAtMs: deps.now() })
      .where(and(eq(events.categoryId, categoryId), notDeleted));
  }

  /** Instante absoluto de inicio — para un recordatorio local, cuando lo añadas. */
  function startUtcMs(event: PlanEvent): number {
    const [y, m, d] = event.localDate.split('-').map(Number);
    return Date.UTC(y, m - 1, d) + event.startMinute * 60_000 + event.tzOffsetMin * 60_000;
  }

  return {
    getEvent: getOrThrow,
    listByDate,
    listByRange,
    create,
    update,
    softDelete,
    clearCategory,
    startUtcMs,
  };
}

export type EventLayer = ReturnType<typeof createEventLayer>;
