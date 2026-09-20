ALTER TABLE `events` ADD `calendar_event_id` text;--> statement-breakpoint
ALTER TABLE `events` ADD `calendar_synced_ms` integer;--> statement-breakpoint
CREATE INDEX `idx_events_calendar` ON `events` (`calendar_event_id`) WHERE "events"."calendar_event_id" is not null;