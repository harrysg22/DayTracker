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

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Entry = typeof entries.$inferSelect;
export type NewEntry = typeof entries.$inferInsert;
export type DailyRollup = typeof dailyRollups.$inferSelect;
