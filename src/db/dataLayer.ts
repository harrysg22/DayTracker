import { and, asc, eq, gt, gte, isNull, lte, ne, or, sql } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { computeLocalDate, currentDeviceTzOffsetMin } from "./dateUtils";
import {
  ActiveTimerExistsError,
  InvalidRangeError,
  NoActiveTimerError,
  NotFoundError,
  OverlapError,
  SplitOutOfRangeError,
} from "./errors";
import { expoRandomUUID, type IdGenerator } from "./ids";
import { categories, dailyRollups, entries } from "./schema";
import type { Category, DailyRollup, Entry } from "./schema";

// Compatible tanto con ExpoSQLiteDatabase (runtime) como con
// BetterSQLite3Database (tests): ambas son 'sync' sobre este schema.
export type AnyDb = BaseSQLiteDatabase<"sync", any, Record<string, unknown>>;

export interface DataLayerDeps {
  now: () => number;
  getTzOffsetMin: () => number;
  genId: IdGenerator;
}

export const defaultDeps: DataLayerDeps = {
  now: () => Date.now(),
  getTzOffsetMin: currentDeviceTzOffsetMin,
  genId: expoRandomUUID,
};

export interface CreateEntryInput {
  categoryId: string;
  startedAtMs: number;
  /** undefined/null => timer en curso (a lo sumo uno en toda la tabla). */
  endedAtMs?: number | null;
  note?: string | null;
  /** Por defecto, el offset actual del dispositivo. */
  tzOffsetMin?: number;
}

export interface UpdateEntryPatch {
  categoryId?: string;
  startedAtMs?: number;
  /** null explícito reabre la entry como timer activo. */
  endedAtMs?: number | null;
  tzOffsetMin?: number;
  note?: string | null;
}

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

export function createDataLayer(db: AnyDb, deps: DataLayerDeps = defaultDeps) {
  async function findOverlap(params: {
    startedAtMs: number;
    endedAtMs: number | null;
    excludeId?: string;
  }): Promise<Entry | null> {
    const conditions = [
      isNull(entries.deletedAtMs),
      // existing.endedAtMs IS NULL (sigue corriendo) OR termina después de que empiece el candidato
      or(isNull(entries.endedAtMs), gt(entries.endedAtMs, params.startedAtMs)),
    ];
    if (params.excludeId) conditions.push(ne(entries.id, params.excludeId));
    // Si el candidato tiene fin, solo importan las existentes que empiezan antes de ese fin.
    // Si el candidato sigue corriendo (endedAtMs null), no hay cota superior.
    if (params.endedAtMs !== null) {
      conditions.push(sql`${entries.startedAtMs} < ${params.endedAtMs}`);
    }

    const rows = await db
      .select()
      .from(entries)
      .where(and(...conditions))
      .limit(1);
    return (rows[0] as Entry | undefined) ?? null;
  }

  async function getEntryOrThrow(id: string): Promise<Entry> {
    const rows = await db
      .select()
      .from(entries)
      .where(and(eq(entries.id, id), isNull(entries.deletedAtMs)))
      .limit(1);
    const row = rows[0] as Entry | undefined;
    if (!row) throw new NotFoundError("entry", id);
    return row;
  }

  async function getActiveTimer(): Promise<Entry | null> {
    // Siempre lee de disco: no hay estado de timer en memoria.
    const rows = await db
      .select()
      .from(entries)
      .where(and(isNull(entries.endedAtMs), isNull(entries.deletedAtMs)))
      .limit(1);
    return (rows[0] as Entry | undefined) ?? null;
  }

  async function recalcRollup(localDate: string): Promise<void> {
    await db.delete(dailyRollups).where(eq(dailyRollups.localDate, localDate));

    // Solo las entries cerradas cuentan para el rollup: una entry en
    // curso todavía no tiene una duración "final" que cachear. El
    // dashboard del día en curso consulta entries directamente (Fase 4).
    const sums = (await db
      .select({
        categoryId: entries.categoryId,
        totalMs: sql<number>`sum(${entries.endedAtMs} - ${entries.startedAtMs})`,
      })
      .from(entries)
      .where(
        and(
          eq(entries.localDate, localDate),
          isNull(entries.deletedAtMs),
          sql`${entries.endedAtMs} is not null`
        )
      )
      .groupBy(entries.categoryId)) as { categoryId: string; totalMs: number }[];

    for (const s of sums) {
      if (s.totalMs > 0) {
        await db.insert(dailyRollups).values({
          localDate,
          categoryId: s.categoryId,
          totalMs: s.totalMs,
        });
      }
    }
  }

  async function startTimer(
    categoryId: string,
    opts: { startedAtMs?: number; tzOffsetMin?: number } = {}
  ): Promise<Entry> {
    const active = await getActiveTimer();
    if (active) throw new ActiveTimerExistsError(active);

    const startedAtMs = opts.startedAtMs ?? deps.now();
    const tzOffsetMin = opts.tzOffsetMin ?? deps.getTzOffsetMin();

    const overlap = await findOverlap({ startedAtMs, endedAtMs: null });
    if (overlap) throw new OverlapError(overlap);

    const localDate = computeLocalDate(startedAtMs, tzOffsetMin);
    const row: Entry = {
      id: deps.genId(),
      categoryId,
      startedAtMs,
      endedAtMs: null,
      tzOffsetMin,
      localDate,
      note: null,
      updatedAtMs: deps.now(),
      deletedAtMs: null,
    };
    await db.insert(entries).values(row);
    return row;
  }

  async function stopTimer(opts: { endedAtMs?: number } = {}): Promise<Entry> {
    const active = await getActiveTimer();
    if (!active) throw new NoActiveTimerError();

    const endedAtMs = opts.endedAtMs ?? deps.now();
    if (endedAtMs <= active.startedAtMs) {
      throw new InvalidRangeError("ended_at_ms debe ser mayor que started_at_ms");
    }

    const updatedAtMs = deps.now();
    await db
      .update(entries)
      .set({ endedAtMs, updatedAtMs })
      .where(eq(entries.id, active.id));

    await recalcRollup(active.localDate);

    return { ...active, endedAtMs, updatedAtMs };
  }

  async function createEntry(input: CreateEntryInput): Promise<Entry> {
    const tzOffsetMin = input.tzOffsetMin ?? deps.getTzOffsetMin();
    const endedAtMs = input.endedAtMs ?? null;

    if (endedAtMs !== null && endedAtMs <= input.startedAtMs) {
      throw new InvalidRangeError("ended_at_ms debe ser mayor que started_at_ms");
    }

    const overlap = await findOverlap({
      startedAtMs: input.startedAtMs,
      endedAtMs,
    });
    if (overlap) throw new OverlapError(overlap);

    const localDate = computeLocalDate(input.startedAtMs, tzOffsetMin);
    const row: Entry = {
      id: deps.genId(),
      categoryId: input.categoryId,
      startedAtMs: input.startedAtMs,
      endedAtMs,
      tzOffsetMin,
      localDate,
      note: input.note ?? null,
      updatedAtMs: deps.now(),
      deletedAtMs: null,
    };
    await db.insert(entries).values(row);

    if (endedAtMs !== null) await recalcRollup(localDate);

    return row;
  }

  async function updateEntry(id: string, patch: UpdateEntryPatch): Promise<Entry> {
    const existing = await getEntryOrThrow(id);

    const nextCategoryId = hasOwn(patch, "categoryId") ? patch.categoryId! : existing.categoryId;
    const nextStartedAtMs = hasOwn(patch, "startedAtMs") ? patch.startedAtMs! : existing.startedAtMs;
    const nextEndedAtMs = hasOwn(patch, "endedAtMs") ? patch.endedAtMs ?? null : existing.endedAtMs;
    const nextTzOffsetMin = hasOwn(patch, "tzOffsetMin") ? patch.tzOffsetMin! : existing.tzOffsetMin;
    const nextNote = hasOwn(patch, "note") ? patch.note ?? null : existing.note;

    if (nextEndedAtMs !== null && nextEndedAtMs <= nextStartedAtMs) {
      throw new InvalidRangeError("ended_at_ms debe ser mayor que started_at_ms");
    }

    const overlap = await findOverlap({
      startedAtMs: nextStartedAtMs,
      endedAtMs: nextEndedAtMs,
      excludeId: id,
    });
    if (overlap) throw new OverlapError(overlap);

    const nextLocalDate = computeLocalDate(nextStartedAtMs, nextTzOffsetMin);
    const updatedAtMs = deps.now();

    await db
      .update(entries)
      .set({
        categoryId: nextCategoryId,
        startedAtMs: nextStartedAtMs,
        endedAtMs: nextEndedAtMs,
        tzOffsetMin: nextTzOffsetMin,
        localDate: nextLocalDate,
        note: nextNote,
        updatedAtMs,
      })
      .where(eq(entries.id, id));

    // Recalcula el/los día(s) afectados: el de origen (si estaba cerrado y
    // contaba en el rollup) y el de destino (si queda cerrado).
    const datesToRecalc = new Set<string>();
    if (existing.endedAtMs !== null) datesToRecalc.add(existing.localDate);
    if (nextEndedAtMs !== null) datesToRecalc.add(nextLocalDate);
    for (const d of datesToRecalc) await recalcRollup(d);

    return {
      ...existing,
      categoryId: nextCategoryId,
      startedAtMs: nextStartedAtMs,
      endedAtMs: nextEndedAtMs,
      tzOffsetMin: nextTzOffsetMin,
      localDate: nextLocalDate,
      note: nextNote,
      updatedAtMs,
    };
  }

  async function splitEntry(id: string, atMs: number): Promise<[Entry, Entry]> {
    const existing = await getEntryOrThrow(id);
    const effectiveEnd = existing.endedAtMs ?? deps.now();

    if (atMs <= existing.startedAtMs || atMs >= effectiveEnd) {
      throw new SplitOutOfRangeError(atMs, existing.startedAtMs, effectiveEnd);
    }

    const updatedAtMs = deps.now();

    // Primera mitad: la fila original, cerrada en atMs. Debe escribirse
    // ANTES de insertar la segunda mitad para no violar momentáneamente
    // idx_one_active si la entry original seguía corriendo.
    await db
      .update(entries)
      .set({ endedAtMs: atMs, updatedAtMs })
      .where(eq(entries.id, id));

    const secondLocalDate = computeLocalDate(atMs, existing.tzOffsetMin);
    const second: Entry = {
      id: deps.genId(),
      categoryId: existing.categoryId,
      startedAtMs: atMs,
      endedAtMs: existing.endedAtMs, // null si la original seguía corriendo
      tzOffsetMin: existing.tzOffsetMin,
      localDate: secondLocalDate,
      note: existing.note,
      updatedAtMs,
      deletedAtMs: null,
    };
    await db.insert(entries).values(second);

    await recalcRollup(existing.localDate);
    if (secondLocalDate !== existing.localDate) await recalcRollup(secondLocalDate);

    const first: Entry = { ...existing, endedAtMs: atMs, updatedAtMs };
    return [first, second];
  }

  async function deleteEntry(id: string): Promise<void> {
    const existing = await getEntryOrThrow(id);
    const now = deps.now();
    // Si era el timer activo, se cierra al borrarlo: idx_one_active exige
    // que a lo sumo una fila (borrada o no) tenga ended_at_ms IS NULL.
    const endedAtMs = existing.endedAtMs ?? now;

    await db
      .update(entries)
      .set({ deletedAtMs: now, endedAtMs, updatedAtMs: now })
      .where(eq(entries.id, id));

    await recalcRollup(existing.localDate);
  }

  async function getDay(localDate: string): Promise<Entry[]> {
    return (await db
      .select()
      .from(entries)
      .where(and(eq(entries.localDate, localDate), isNull(entries.deletedAtMs)))
      .orderBy(asc(entries.startedAtMs))) as Entry[];
  }

  async function getRange(from: string, to: string): Promise<Entry[]> {
    return (await db
      .select()
      .from(entries)
      .where(
        and(
          gte(entries.localDate, from),
          lte(entries.localDate, to),
          isNull(entries.deletedAtMs)
        )
      )
      .orderBy(asc(entries.startedAtMs))) as Entry[];
  }

  async function getRollupRange(from: string, to: string): Promise<DailyRollup[]> {
    return (await db
      .select()
      .from(dailyRollups)
      .where(and(gte(dailyRollups.localDate, from), lte(dailyRollups.localDate, to)))) as DailyRollup[];
  }

  async function listCategories(includeArchived = false): Promise<Category[]> {
    const rows = await db
      .select()
      .from(categories)
      .where(isNull(categories.deletedAtMs))
      .orderBy(asc(categories.sortOrder));
    const all = rows as Category[];
    return includeArchived ? all : all.filter((c) => c.archived === 0);
  }

  async function vacuumInto(path: string): Promise<void> {
    await db.run(sql`VACUUM INTO ${path}`);
  }

  // CRUD completo de categorías llega en Fase 2; esto es lo mínimo que
  // ya necesitan el seed script y la capa de datos internamente.
  async function createCategory(input: {
    name: string;
    color: string;
    parentId?: string | null;
    sortOrder?: number;
  }): Promise<Category> {
    const row: Category = {
      id: deps.genId(),
      name: input.name,
      color: input.color,
      parentId: input.parentId ?? null,
      archived: 0,
      sortOrder: input.sortOrder ?? 0,
      updatedAtMs: deps.now(),
      deletedAtMs: null,
    };
    await db.insert(categories).values(row);
    return row;
  }

  return {
    startTimer,
    stopTimer,
    getActiveTimer,
    createEntry,
    updateEntry,
    splitEntry,
    deleteEntry,
    getDay,
    getRange,
    getRollupRange,
    recalcRollup,
    listCategories,
    createCategory,
    vacuumInto,
  };
}

export type DataLayer = ReturnType<typeof createDataLayer>;
