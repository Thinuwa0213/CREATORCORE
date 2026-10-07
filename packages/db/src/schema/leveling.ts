import {
  bigint,
  boolean,
  char,
  index,
  int,
  json,
  mysqlTable,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Server-specific XP & Leveling Configuration.
 */
export const guildXpSettings = mysqlTable(
  "guild_xp_settings",
  {
    id: char("id", { length: 36 }).primaryKey(),
    guildId: bigint("guild_id", { mode: "bigint", unsigned: true }).notNull().unique(),
    enabled: boolean("enabled").notNull().default(true),
    xpMin: int("xp_min").notNull().default(15),
    xpMax: int("xp_max").notNull().default(25),
    cooldownSeconds: int("cooldown_seconds").notNull().default(60),
    announcementEnabled: boolean("announcement_enabled").notNull().default(true),
    announcementChannelId: varchar("announcement_channel_id", { length: 64 }),
    ignoredChannels: json("ignored_channels").$type<string[]>(),
    voiceXpEnabled: boolean("voice_xp_enabled").notNull().default(false),
    voiceXpPerInterval: int("voice_xp_per_interval").notNull().default(10),
    voiceIntervalMinutes: int("voice_interval_minutes").notNull().default(5),
    roleRewardsEnabled: boolean("role_rewards_enabled").notNull().default(false),
    boosterMultiplierEnabled: boolean("booster_multiplier_enabled").notNull().default(true),
    boosterMultiplier: int("booster_multiplier").notNull().default(150), // 150 = 1.5x
    dailyXpEnabled: boolean("daily_xp_enabled").notNull().default(true),
    dailyXpAmount: int("daily_xp_amount").notNull().default(100),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
);

/**
 * User server-specific XP and level records.
 */
export const userXp = mysqlTable(
  "user_xp",
  {
    id: char("id", { length: 36 }).primaryKey(),
    guildId: bigint("guild_id", { mode: "bigint", unsigned: true }).notNull(),
    userId: bigint("user_id", { mode: "bigint", unsigned: true }).notNull(),
    xp: bigint("xp", { mode: "bigint", unsigned: true }).notNull().default(0n),
    level: int("level").notNull().default(0),
    lastXpAt: timestamp("last_xp_at"),
    lastDailyAt: timestamp("last_daily_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    unique("user_xp_guild_user_uq").on(table.guildId, table.userId),
    index("user_xp_guild_xp_idx").on(table.guildId, table.xp),
  ],
);

/**
 * Milestone role rewards granted automatically when a user reaches a given level.
 */
export const xpLevelRewards = mysqlTable(
  "xp_level_rewards",
  {
    id: char("id", { length: 36 }).primaryKey(),
    guildId: bigint("guild_id", { mode: "bigint", unsigned: true }).notNull(),
    level: int("level").notNull(),
    roleId: varchar("role_id", { length: 64 }).notNull(),
    roleName: varchar("role_name", { length: 255 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    unique("xp_level_rewards_guild_level_uq").on(table.guildId, table.level),
  ],
);
