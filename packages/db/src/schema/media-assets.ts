import { bigint, char, index, int, mysqlTable, timestamp, unique, varchar } from "drizzle-orm/mysql-core";
import { tenants } from "./tenants.js";
import { guilds } from "./guilds.js";

/**
 * Physical media assets table for CreatorCore branding uploads (Phase 5 §Branding).
 * Stores relative storage paths (e.g. tenants/{tenantId}/guilds/{guildId}/avatar/{filename})
 * and exact file sizes for strict tenant storage quota enforcement.
 */
export const mediaAssets = mysqlTable(
  "media_assets",
  {
    id: char("id", { length: 36 }).primaryKey(),
    tenantId: char("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    guildId: bigint("guild_id", { mode: "bigint", unsigned: true })
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    assetType: varchar("asset_type", { length: 50 }).notNull(), // "BOT_AVATAR" | "BOT_BANNER"
    storagePath: varchar("storage_path", { length: 500 }).notNull(),
    fileSizeBytes: int("file_size_bytes", { unsigned: true }).notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    index("media_assets_tenant_id_idx").on(table.tenantId),
    index("media_assets_guild_id_idx").on(table.guildId),
    unique("media_assets_guild_asset_type_uq").on(table.guildId, table.assetType),
  ],
);
