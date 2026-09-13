import { and, eq } from "drizzle-orm";
import { guilds } from "../schema/index.js";
import type { Db } from "../types.js";
import { assertTenantActive } from "./tenants.js";

export interface Guild {
  id: bigint;
  tenantId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * docs/DATABASE_RULES.md's findByTenantAndId rule: the authorizing tenantId
 * is a required parameter and part of the WHERE clause -- a caller cannot
 * fetch a guild by ID alone. A guildId belonging to a different tenant
 * yields undefined, not the other tenant's row.
 */
export async function findGuildByTenantAndId(
  db: Db,
  tenantId: string,
  guildId: bigint,
): Promise<Guild | undefined> {
  const [row] = await db
    .select()
    .from(guilds)
    .where(and(eq(guilds.tenantId, tenantId), eq(guilds.id, guildId)))
    .limit(1);
  return row;
}

export async function listGuildsByTenant(db: Db, tenantId: string): Promise<Guild[]> {
  return db.select().from(guilds).where(eq(guilds.tenantId, tenantId));
}

export async function createGuild(
  db: Db,
  tenantId: string,
  guildId: bigint,
  name: string,
): Promise<Guild> {
  await assertTenantActive(db, tenantId);
  await db.insert(guilds).values({ id: guildId, tenantId, name });
  const created = await findGuildByTenantAndId(db, tenantId, guildId);
  if (!created) {
    throw new Error("createGuild: row not found immediately after insert");
  }
  return created;
}
