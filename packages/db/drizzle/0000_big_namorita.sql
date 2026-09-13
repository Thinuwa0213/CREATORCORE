CREATE TABLE `users` (
	`id` bigint unsigned NOT NULL,
	`discord_username` varchar(64),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `users_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tenants` (
	`id` char(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`status` enum('ACTIVE','DISABLED') NOT NULL DEFAULT 'ACTIVE',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tenants_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tenant_memberships` (
	`tenant_id` char(36) NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`role` enum('owner','admin','member') NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tenant_memberships_tenant_id_user_id_pk` PRIMARY KEY(`tenant_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `guilds` (
	`id` bigint unsigned NOT NULL,
	`tenant_id` char(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `guilds_id` PRIMARY KEY(`id`),
	CONSTRAINT `guilds_id_tenant_id_uq` UNIQUE(`id`,`tenant_id`)
);
--> statement-breakpoint
CREATE TABLE `bot_applications` (
	`id` char(36) NOT NULL,
	`tenant_id` char(36) NOT NULL,
	`discord_application_id` bigint unsigned NOT NULL,
	`name` varchar(255) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bot_applications_id` PRIMARY KEY(`id`),
	CONSTRAINT `bot_applications_discord_application_id_unique` UNIQUE(`discord_application_id`),
	CONSTRAINT `bot_applications_id_tenant_id_uq` UNIQUE(`id`,`tenant_id`)
);
--> statement-breakpoint
CREATE TABLE `guild_bot_assignments` (
	`guild_id` bigint unsigned NOT NULL,
	`bot_application_id` char(36) NOT NULL,
	`tenant_id` char(36) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `guild_bot_assignments_guild_id` PRIMARY KEY(`guild_id`)
);
--> statement-breakpoint
CREATE TABLE `workers` (
	`id` varchar(64) NOT NULL,
	`bootstrap_secret_hash` varchar(255) NOT NULL,
	`bootstrap_secret_salt` varchar(64) NOT NULL,
	`status` enum('ACTIVE','REVOKED') NOT NULL DEFAULT 'ACTIVE',
	`last_seen_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `worker_eligibility` (
	`bot_application_id` char(36) NOT NULL,
	`worker_id` varchar(64) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `worker_eligibility_bot_application_id_worker_id_pk` PRIMARY KEY(`bot_application_id`,`worker_id`)
);
--> statement-breakpoint
CREATE TABLE `worker_assignments` (
	`bot_application_id` char(36) NOT NULL,
	`worker_id` varchar(64) NOT NULL,
	`status` enum('ACTIVE','RELEASED') NOT NULL DEFAULT 'ACTIVE',
	`claimed_at` timestamp NOT NULL DEFAULT (now()),
	`lease_expires_at` timestamp NOT NULL,
	`last_heartbeat_at` timestamp,
	`released_at` timestamp,
	CONSTRAINT `worker_assignments_bot_application_id` PRIMARY KEY(`bot_application_id`)
);
--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`occurred_at` timestamp(6) NOT NULL DEFAULT (now()),
	`actor_type` enum('USER','WORKER','SYSTEM') NOT NULL,
	`actor_user_id` bigint unsigned,
	`actor_worker_id` varchar(64),
	`tenant_id` char(36),
	`guild_id` bigint unsigned,
	`target_type` varchar(64) NOT NULL,
	`target_id` varchar(64) NOT NULL,
	`action` varchar(128) NOT NULL,
	`outcome` enum('SUCCESS','FAILURE','DENIED') NOT NULL,
	`metadata` json,
	CONSTRAINT `audit_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bot_credentials` (
	`id` char(36) NOT NULL,
	`bot_application_id` char(36) NOT NULL,
	`status` enum('PENDING','ACTIVE','SUPERSEDED') NOT NULL,
	`key_version` int NOT NULL DEFAULT 1,
	`ciphertext` varbinary(4096) NOT NULL,
	`nonce` varbinary(24) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`superseded_at` timestamp,
	CONSTRAINT `bot_credentials_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `tenant_memberships` ADD CONSTRAINT `tenant_memberships_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tenant_memberships` ADD CONSTRAINT `tenant_memberships_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `guilds` ADD CONSTRAINT `guilds_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bot_applications` ADD CONSTRAINT `bot_applications_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `guild_bot_assignments` ADD CONSTRAINT `guild_bot_assignments_guild_tenant_fk` FOREIGN KEY (`guild_id`,`tenant_id`) REFERENCES `guilds`(`id`,`tenant_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `guild_bot_assignments` ADD CONSTRAINT `guild_bot_assignments_bot_application_tenant_fk` FOREIGN KEY (`bot_application_id`,`tenant_id`) REFERENCES `bot_applications`(`id`,`tenant_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `worker_eligibility` ADD CONSTRAINT `worker_eligibility_bot_application_id_bot_applications_id_fk` FOREIGN KEY (`bot_application_id`) REFERENCES `bot_applications`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `worker_eligibility` ADD CONSTRAINT `worker_eligibility_worker_id_workers_id_fk` FOREIGN KEY (`worker_id`) REFERENCES `workers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `worker_assignments` ADD CONSTRAINT `worker_assignments_bot_application_id_bot_applications_id_fk` FOREIGN KEY (`bot_application_id`) REFERENCES `bot_applications`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `worker_assignments` ADD CONSTRAINT `worker_assignments_worker_id_workers_id_fk` FOREIGN KEY (`worker_id`) REFERENCES `workers`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bot_credentials` ADD CONSTRAINT `bot_credentials_bot_application_id_bot_applications_id_fk` FOREIGN KEY (`bot_application_id`) REFERENCES `bot_applications`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `audit_events_tenant_occurred_idx` ON `audit_events` (`tenant_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `audit_events_target_idx` ON `audit_events` (`target_type`,`target_id`);--> statement-breakpoint
CREATE INDEX `audit_events_action_occurred_idx` ON `audit_events` (`action`,`occurred_at`);