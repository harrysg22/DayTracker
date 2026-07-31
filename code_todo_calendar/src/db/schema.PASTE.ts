// ─────────────────────────────────────────────────────────────────────────────
// PEGAR EN src/db/schema.ts  (al final, antes de los `export type`)
// Los imports que faltan: `index` ya está importado en tu archivo, igual que
// `sql`, `integer`, `sqliteTable` y `text`. No hace falta añadir imports.
// ─────────────────────────────────────────────────────────────────────────────

export const todos = sqliteTable(
  "todos",
  {
    id: text("id").primaryKey(),
    text: text("text").notNull(),
    // Nullable a propósito: un to-do puede existir sin categoría.
    categoryId: text("category_id").references(() => categories.id),
    // 'YYYY-MM-DD' — fecha de pared. Nunca un offset relativo, nunca epoch.
    dueDate: text("due_date").notNull(),
    done: integer("done").notNull().default(0),
    doneAtMs: integer("done_at_ms"),
    sortOrder: integer("sort_order").notNull().default(0),
    updatedAtMs: integer("updated_at_ms").notNull(),
    deletedAtMs: integer("deleted_at_ms"),
  },
  (table) => [
    index("idx_todos_due")
      .on(table.dueDate, table.done)
      .where(sql`${table.deletedAtMs} is null`),
  ]
);

export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    categoryId: text("category_id").references(() => categories.id),
    // Fecha + minuto de pared: las 7 PM siguen siendo las 7 PM tras un cambio
    // de huso o DST. `entries` guarda instantes absolutos; esto no.
    localDate: text("local_date").notNull(),
    startMinute: integer("start_minute").notNull(), // 0..1439
    durationMinutes: integer("duration_minutes").notNull(), // 15..720
    // Solo para convertir a instante absoluto (recordatorios). Convención de
    // dateUtils: Bogotá = +300.
    tzOffsetMin: integer("tz_offset_min").notNull(),
    note: text("note"),
    updatedAtMs: integer("updated_at_ms").notNull(),
    deletedAtMs: integer("deleted_at_ms"),
  },
  (table) => [
    index("idx_events_date")
      .on(table.localDate, table.startMinute)
      .where(sql`${table.deletedAtMs} is null`),
  ]
);

// ── y junto a los demás tipos, al final del archivo ──────────────────────────

export type Todo = typeof todos.$inferSelect;
export type NewTodo = typeof todos.$inferInsert;
/** OJO: no llamarlo `Event` — choca con el tipo global del DOM/RN. */
export type PlanEvent = typeof events.$inferSelect;
export type NewPlanEvent = typeof events.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// Después de pegar esto:
//     npm run db:generate
// Debe generar src/db/migrations/0001_*.sql con SOLO dos CREATE TABLE y sus
// CREATE INDEX. ensureDbReady() la aplica en el próximo arranque.
// ─────────────────────────────────────────────────────────────────────────────
