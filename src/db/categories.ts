import { and, eq, isNull, sql } from 'drizzle-orm';
import type { AnyDb, DataLayerDeps } from './dataLayer';
import { defaultDeps } from './dataLayer';
import { NotFoundError, InvalidRangeError } from './errors';
import { categories, entries } from './schema';
import type { Category } from './schema';

/**
 * Fase 2 — category CRUD. Same shape as createDataLayer: no SQL in screens.
 * Merge these into createDataLayer's returned object, or keep as a sibling
 * factory and re-export from src/db/index.ts.
 *
 * Two rules the UI relies on and that live here, not in components:
 *
 *  1. ONE level of nesting. A category's parent must be top level, a
 *     category cannot be its own parent, and a category that has children
 *     cannot itself be nested.
 *  2. Deleting a category is never a silent cascade. The caller must choose
 *     between reassigning its entries or deleting them, and says so.
 */
export function createCategoryLayer(db: AnyDb, deps: DataLayerDeps = defaultDeps) {
  async function getOrThrow(id: string): Promise<Category> {
    const rows = await db
      .select()
      .from(categories)
      .where(and(eq(categories.id, id), isNull(categories.deletedAtMs)))
      .limit(1);
    const row = rows[0] as Category | undefined;
    if (!row) throw new NotFoundError('category', id);
    return row;
  }

  async function childrenOf(id: string): Promise<Category[]> {
    return (await db
      .select()
      .from(categories)
      .where(and(eq(categories.parentId, id), isNull(categories.deletedAtMs)))) as Category[];
  }

  async function assertNestingOk(id: string | null, parentId: string | null): Promise<void> {
    if (parentId === null) return;
    if (id !== null && parentId === id) {
      throw new InvalidRangeError('Una categoria no puede ser su propio padre.');
    }
    const parent = await getOrThrow(parentId);
    if (parent.parentId !== null) {
      throw new InvalidRangeError('Solo se permite un nivel de anidamiento.');
    }
    if (id !== null && (await childrenOf(id)).length > 0) {
      throw new InvalidRangeError('Una categoria con subcategorias no puede anidarse.');
    }
  }

  /** Parent options the editor may offer for a given category (null = new). */
  async function eligibleParents(id: string | null): Promise<Category[]> {
    if (id !== null && (await childrenOf(id)).length > 0) return [];
    const rows = (await db
      .select()
      .from(categories)
      .where(and(isNull(categories.parentId), isNull(categories.deletedAtMs)))) as Category[];
    return rows.filter((c) => c.archived === 0 && c.id !== id);
  }

  async function updateCategory(
    id: string,
    patch: { name?: string; color?: string; parentId?: string | null; sortOrder?: number }
  ): Promise<Category> {
    const existing = await getOrThrow(id);
    const nextParentId = Object.prototype.hasOwnProperty.call(patch, 'parentId')
      ? patch.parentId ?? null
      : existing.parentId;
    await assertNestingOk(id, nextParentId);

    const updatedAtMs = deps.now();
    await db
      .update(categories)
      .set({
        name: patch.name ?? existing.name,
        color: patch.color ?? existing.color,
        parentId: nextParentId,
        sortOrder: patch.sortOrder ?? existing.sortOrder,
        updatedAtMs,
      })
      .where(eq(categories.id, id));

    return { ...existing, ...patch, parentId: nextParentId, updatedAtMs } as Category;
  }

  /** Archive hides it from pickers. History is untouched. Reversible. */
  async function setArchived(id: string, archived: boolean): Promise<void> {
    await getOrThrow(id);
    await db
      .update(categories)
      .set({ archived: archived ? 1 : 0, updatedAtMs: deps.now() })
      .where(eq(categories.id, id));
  }

  /** How much is riding on this category — the UI must show this before deleting. */
  async function usage(id: string): Promise<{ entryCount: number; totalMs: number }> {
    const rows = (await db
      .select({
        entryCount: sql<number>`count(*)`,
        totalMs: sql<number>`coalesce(sum(coalesce(${entries.endedAtMs}, ${deps.now()}) - ${entries.startedAtMs}), 0)`,
      })
      .from(entries)
      .where(and(eq(entries.categoryId, id), isNull(entries.deletedAtMs)))) as {
      entryCount: number;
      totalMs: number;
    }[];
    return rows[0] ?? { entryCount: 0, totalMs: 0 };
  }

  /** Move every entry to another category. The safe path out of a bad name. */
  async function reassignEntries(fromId: string, toId: string): Promise<number> {
    if (fromId === toId) throw new InvalidRangeError('Origen y destino son la misma categoria.');
    await getOrThrow(toId);
    const affected = await usage(fromId);
    await db
      .update(entries)
      .set({ categoryId: toId, updatedAtMs: deps.now() })
      .where(and(eq(entries.categoryId, fromId), isNull(entries.deletedAtMs)));
    return affected.entryCount;
  }

  /**
   * Soft-delete. `mode` is deliberately explicit — there is no default.
   *  'reassign': entries move to `reassignToId`, nothing is lost.
   *  'cascade' : entries are soft-deleted too. The time disappears from
   *              every past day and from Insights. Confirm in the UI first.
   * Children are lifted to top level so no orphan ever points at a dead parent.
   */
  async function deleteCategory(
    id: string,
    mode: { kind: 'reassign'; reassignToId: string } | { kind: 'cascade' }
  ): Promise<void> {
    await getOrThrow(id);
    const now = deps.now();

    if (mode.kind === 'reassign') {
      await reassignEntries(id, mode.reassignToId);
    } else {
      await db
        .update(entries)
        .set({
          deletedAtMs: now,
          // idx_one_active demands at most one row with ended_at_ms IS NULL,
          // deleted or not — so close the running timer if it was this one.
          endedAtMs: sql`coalesce(${entries.endedAtMs}, ${now})`,
          updatedAtMs: now,
        })
        .where(and(eq(entries.categoryId, id), isNull(entries.deletedAtMs)));
    }

    for (const child of await childrenOf(id)) {
      await db
        .update(categories)
        .set({ parentId: null, updatedAtMs: now })
        .where(eq(categories.id, child.id));
    }

    await db
      .update(categories)
      .set({ deletedAtMs: now, updatedAtMs: now })
      .where(eq(categories.id, id));
  }

  /** Ranked by minutes over the last N days — drives "Most used" in the picker. */
  async function rankByRecentUse(days = 14): Promise<Record<string, number>> {
    const since = deps.now() - days * 86_400_000;
    const rows = (await db
      .select({
        categoryId: entries.categoryId,
        totalMs: sql<number>`sum(coalesce(${entries.endedAtMs}, ${deps.now()}) - ${entries.startedAtMs})`,
      })
      .from(entries)
      .where(and(isNull(entries.deletedAtMs), sql`${entries.startedAtMs} >= ${since}`))
      .groupBy(entries.categoryId)) as { categoryId: string; totalMs: number }[];
    const out: Record<string, number> = {};
    for (const r of rows) out[r.categoryId] = r.totalMs;
    return out;
  }

  return {
    getCategory: getOrThrow,
    childrenOf,
    eligibleParents,
    updateCategory,
    setArchived,
    usage,
    reassignEntries,
    deleteCategory,
    rankByRecentUse,
  };
}

export type CategoryLayer = ReturnType<typeof createCategoryLayer>;
