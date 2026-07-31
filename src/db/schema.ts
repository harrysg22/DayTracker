import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull(),
  parentId: text("parent_id"),
  archived: integer("archived").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
  updatedAtMs: integer("updated_at_ms").notNull(),
  deletedAtMs: integer("deleted_at_ms"),
});

export const entries = sqliteTable(
  "entries",
  {
    id: text("id").primaryKey(),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id),
    startedAtMs: integer("started_at_ms").notNull(),
    // NULL = timer corriendo
    endedAtMs: integer("ended_at_ms"),
    tzOffsetMin: integer("tz_offset_min").notNull(),
    // 'YYYY-MM-DD'
    localDate: text("local_date").notNull(),
    note: text("note"),
    updatedAtMs: integer("updated_at_ms").notNull(),
    deletedAtMs: integer("deleted_at_ms"),
  },
  (table) => [
    index("idx_entries_local_date")
      .on(table.localDate)
      .where(sql`${table.deletedAtMs} is null`),
    index("idx_entries_started").on(table.startedAtMs),
    // La base garantiza un solo timer activo: no se deja a la lógica de la app.
    uniqueIndex("idx_one_active")
      .on(table.endedAtMs)
      .where(sql`${table.endedAtMs} is null`),
  ]
);

export const dailyRollups = sqliteTable(
  "daily_rollups",
  {
    localDate: text("local_date").notNull(),
    categoryId: text("category_id").notNull(),
    totalMs: integer("total_ms").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.localDate, table.categoryId] }),
  ]
);

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

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Entry = typeof entries.$inferSelect;
export type NewEntry = typeof entries.$inferInsert;
export type DailyRollup = typeof dailyRollups.$inferSelect;
export type Todo = typeof todos.$inferSelect;
export type NewTodo = typeof todos.$inferInsert;
/** OJO: no llamarlo `Event` — choca con el tipo global del DOM/RN. */
export type PlanEvent = typeof events.$inferSelect;
export type NewPlanEvent = typeof events.$inferInsert;
