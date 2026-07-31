CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`category_id` text,
	`local_date` text NOT NULL,
	`start_minute` integer NOT NULL,
	`duration_minutes` integer NOT NULL,
	`tz_offset_min` integer NOT NULL,
	`note` text,
	`updated_at_ms` integer NOT NULL,
	`deleted_at_ms` integer,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_events_date` ON `events` (`local_date`,`start_minute`) WHERE "events"."deleted_at_ms" is null;--> statement-breakpoint
CREATE TABLE `todos` (
	`id` text PRIMARY KEY NOT NULL,
	`text` text NOT NULL,
	`category_id` text,
	`due_date` text NOT NULL,
	`done` integer DEFAULT 0 NOT NULL,
	`done_at_ms` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`updated_at_ms` integer NOT NULL,
	`deleted_at_ms` integer,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_todos_due` ON `todos` (`due_date`,`done`) WHERE "todos"."deleted_at_ms" is null;