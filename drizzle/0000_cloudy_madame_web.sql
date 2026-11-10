CREATE TABLE `books` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`author` text DEFAULT '' NOT NULL,
	`format` text NOT NULL,
	`original_name` text NOT NULL,
	`word_count` integer NOT NULL,
	`size` integer NOT NULL,
	`created_at` text NOT NULL
);
