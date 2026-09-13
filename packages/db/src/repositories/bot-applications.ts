import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { botApplications } from "../schema/index.js";
import type { Db } from "../types.js";
import { assertTenantActive } from "./tenants.js";
import { assignEligibleWorkers } from "./worker-eligibility.js";

export interface BotApplication {
  id: string;
  tenantId: string;
  discordApplicationId: bigint;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

/** findByTenantAndId (docs/DATABASE_RULES.md) -- tenantId is required and filtered in the WHERE clause. */
export async function findBotApplicationByTenantAndId(
  db: Db,
  tenantId: string,
  botApplicationId: string,
): Promise<BotApplication | undefined> {
  const [row] = await db
    .select()
    .from(botApplications)
    .where(and(eq(botApplications.tenantId, tenantId), eq(botApplications.id, botApplicationId)))
    .limit(1);
  return row;
}

/**
 * Creates a BotApplication and, in the same call, assigns its initial
 * worker eligibility (up to 2 currently-ACTIVE workers, least-loaded --
 * see repositories/worker-eligibility.ts). This is deliberate: a
 * BotApplication should never exist in a state where no eligibility
 * decision has been made for it yet, since worker-assignments.ts's claim
 * path treats "no eligibility row" as "no worker may claim this," which
 * would otherwise silently strand a newly-created BotApplication.
 */
export async function createBotApplication(
  db: Db,
  tenantId: string,
  discordApplicationId: bigint,
  name: string,
): Promise<BotApplication> {
  await assertTenantActive(db, tenantId);
  const id = randomUUID();
  await db.insert(botApplications).values({ id, tenantId, discordApplicationId, name });
  await assignEligibleWorkers(db, id);
  const created = await findBotApplicationByTenantAndId(db, tenantId, id);
  if (!created) {
    throw new Error("createBotApplication: row not found immediately after insert");
  }
  return created;
}

/**
 * Inserts a BotApplication WITHOUT assigning worker eligibility -- the one
 * deliberate exception to createBotApplication's "never exists without an
 * eligibility decision" invariant above, used only by Phase 5's bot
 * onboarding orchestration (apps/api/src/services/bot-onboarding-service.ts).
 *
 * That orchestrator needs BotApplication creation, ACTIVE credential
 * persistence, and guild attachment to commit as one atomic transaction
 * before a worker can ever discover this BotApplication (task Amendment 3:
 * "A BotApplication must never become worker-discoverable unless its
 * required ACTIVE credential and guild relationship have been committed
 * successfully") -- so it calls `assignEligibleWorkers` itself, explicitly,
 * as the last step inside that same transaction, once the credential and
 * guild attachment are already staged. Every other existing caller keeps
 * using `createBotApplication` above unchanged; this function is additive,
 * not a replacement.
 *
 * `id` may be supplied so the caller can pre-generate it outside the
 * transaction (needed to bind the credential's AAD to the BotApplication id
 * before either row is written -- see the onboarding service).
 */
export async function createBotApplicationPendingEligibility(
  db: Db,
  tenantId: string,
  discordApplicationId: bigint,
  name: string,
  id: string = randomUUID(),
): Promise<BotApplication> {
  await assertTenantActive(db, tenantId);
  await db.insert(botApplications).values({ id, tenantId, discordApplicationId, name });
  const created = await findBotApplicationByTenantAndId(db, tenantId, id);
  if (!created) {
    throw new Error("createBotApplicationPendingEligibility: row not found immediately after insert");
  }
  return created;
}
