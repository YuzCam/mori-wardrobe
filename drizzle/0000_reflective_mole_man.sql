CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`garment_id` text NOT NULL,
	`kind` text NOT NULL,
	`key` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `assets_garment` ON `assets` (`owner`,`garment_id`);--> statement-breakpoint
CREATE TABLE `garments` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`data` text NOT NULL,
	`import_key` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `garments_owner_date` ON `garments` (`owner`,`created_at`);--> statement-breakpoint
CREATE INDEX `garments_owner_category` ON `garments` (`owner`,`category`);--> statement-breakpoint
CREATE UNIQUE INDEX `garments_import_key` ON `garments` (`owner`,`import_key`);--> statement-breakpoint
CREATE TABLE `outfits` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`date` text NOT NULL,
	`data` text NOT NULL,
	`favorite` integer DEFAULT 0 NOT NULL,
	`worn` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `outfits_owner_date` ON `outfits` (`owner`,`date`);--> statement-breakpoint
CREATE TABLE `preferences` (
	`owner` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recognition_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`garment_id` text NOT NULL,
	`owner` text NOT NULL,
	`data` text NOT NULL,
	`created_at` text NOT NULL
);
