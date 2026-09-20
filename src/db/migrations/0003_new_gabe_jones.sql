PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_todos` (
	`id` text PRIMARY KEY NOT NULL,
	`text` text NOT NULL,
	`category_id` text,
	`due_date` text,
	`done` integer DEFAULT 0 NOT NULL,
	`done_at_ms` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`updated_at_ms` integer NOT NULL,
	`deleted_at_ms` integer,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_todos`("id", "text", "category_id", "due_date", "done", "done_at_ms", "sort_order", "updated_at_ms", "deleted_at_ms") SELECT "id", "text", "category_id", "due_date", "done", "done_at_ms", "sort_order", "updated_at_ms", "deleted_at_ms" FROM `todos`;--> statement-breakpoint
DROP TABLE `todos`;--> statement-breakpoint
ALTER TABLE `__new_todos` RENAME TO `todos`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_todos_due` ON `todos` (`due_date`,`done`) WHERE "todos"."deleted_at_ms" is null;