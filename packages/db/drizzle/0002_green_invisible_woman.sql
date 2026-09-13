ALTER TABLE `bot_credentials` ADD `auth_tag` varbinary(16) NOT NULL;--> statement-breakpoint
ALTER TABLE `bot_credentials` ADD `activated_at` timestamp;--> statement-breakpoint
CREATE INDEX `bot_credentials_app_status_idx` ON `bot_credentials` (`bot_application_id`,`status`);