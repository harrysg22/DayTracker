CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`parent_id` text,
	`archived` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`updated_at_ms` integer NOT NULL,
	`deleted_at_ms` integer
);
--> statement-breakpoint
CREATE TABLE `daily_rollups` (
	`local_date` text NOT NULL,
	`category_id` text NOT NULL,
	`total_ms` integer NOT NULL,
	PRIMARY KEY(`local_date`, `category_id`)
);
--> statement-breakpoint
CREATE TABLE `entries` (
	`id` text PRIMARY KEY NOT NULL,
	`category_id` text NOT NULL,
	`started_at_ms` integer NOT NULL,
	`ended_at_ms` integer,
	`tz_offset_min` integer NOT NULL,
	`local_date` text NOT NULL,
	`note` text,
	`updated_at_ms` integer NOT NULL,
	`deleted_at_ms` integer,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_entries_local_date` ON `entries` (`local_date`) WHERE "entries"."deleted_at_ms" is null;--> statement-breakpoint
CREATE INDEX `idx_entries_started` ON `entries` (`started_at_ms`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_one_active` ON `entries` (`ended_at_ms`) WHERE "entries"."ended_at_ms" is null;