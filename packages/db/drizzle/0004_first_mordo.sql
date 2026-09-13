CREATE TABLE `bot_runtime_status` (
	`bot_application_id` varchar(36) NOT NULL,
	`worker_id` varchar(64) NOT NULL,
	`state` enum('STARTING','READY','ERROR','STOPPED') NOT NULL,
	`connected_at` timestamp,
	`last_seen_at` timestamp NOT NULL DEFAULT (now()),
	`discord_bot_user_id` varchar(32),
	`error_category` varchar(64),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bot_runtime_status_bot_application_id` PRIMARY KEY(`bot_application_id`)
);
--> statement-breakpoint
ALTER TABLE `bot_runtime_status` ADD CONSTRAINT `bot_runtime_status_bot_application_id_bot_applications_id_fk` FOREIGN KEY (`bot_application_id`) REFERENCES `bot_applications`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bot_runtime_status` ADD CONSTRAINT `bot_runtime_status_worker_id_workers_id_fk` FOREIGN KEY (`worker_id`) REFERENCES `workers`(`id`) ON DELETE restrict ON UPDATE no action;