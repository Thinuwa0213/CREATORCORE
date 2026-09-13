import { randomBytes, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { authAccounts, authSessions, authUsers } from "../schema/index.js";
import type { Db } from "../types.js";
import { createUser, findUserById } from "./users.js";

const DISCORD_PROVIDER_ID = "discord";

/**
 * Resolves the Discord account id (the CreatorCore identity — see
 * users.ts's "no surrogate key" comment) for a Better Auth session's own
 * internal `user.id`. This is the one explicit bridge between Better Auth's
 * identity space and CreatorCore's authorization identity (Phase 5 design
 * doc, architecture-review MEDIUM-6): every authenticated request resolves
 * through this lookup exactly once, never by trusting a client-supplied id.
 */
export async function findDiscordAccountIdByBetterAuthUserId(
  db: Db,
  betterAuthUserId: string,
): Promise<bigint | undefined> {
  const [row] = await db
    .select({ accountId: authAccounts.accountId })
    .from(authAccounts)
    .where(
      and(
        eq(authAccounts.userId, betterAuthUserId),
        eq(authAccounts.providerId, DISCORD_PROVIDER_ID),
      ),
    )
    .limit(1);

  if (!row) {
    return undefined;
  }

  return BigInt(row.accountId);
}

/**
 * Best-effort lookup of the display name Better Auth already stored on its
 * own `user` row (populated from the Discord profile at sign-in — see
 * apps/api/src/auth/discord-provider.ts), used only to give the CreatorCore
 * `users` row the same safe display metadata at first-ever sign-in
 * (apps/api/src/auth/hooks.ts's `account.create.after`). Never security-
 * relevant: a lookup miss just means no display name is stored.
 */
export async function findAuthUserName(db: Db, betterAuthUserId: string): Promise<string | undefined> {
  const [row] = await db
    .select({ name: authUsers.name })
    .from(authUsers)
    .where(eq(authUsers.id, betterAuthUserId))
    .limit(1);

  return row?.name;
}

/**
 * Creates a legitimate Better Auth user and database-backed session row in MySQL
 * for deterministic E2E test bootstrapping (Amendment 1).
 */
export async function createTestUserSession(
  db: Db,
  discordUserId: bigint,
  name = "Test User",
): Promise<{ sessionToken: string; betterAuthUserId: string }> {
  const discordUserIdStr = discordUserId.toString();
  const betterAuthUserId = `e2e-user-${discordUserIdStr}`;
  const userEmail = `discord-${discordUserIdStr}@users.creatorcore.internal`;

  const existingUser = await findUserById(db, discordUserId);
  if (!existingUser) {
    await createUser(db, discordUserId, name);
  }

  const [existingAuthUser] = await db
    .select({ id: authUsers.id })
    .from(authUsers)
    .where(eq(authUsers.id, betterAuthUserId))
    .limit(1);

  if (!existingAuthUser) {
    await db.insert(authUsers).values({
      id: betterAuthUserId,
      email: userEmail,
      emailVerified: false,
      name,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  const [existingAccount] = await db
    .select({ id: authAccounts.id })
    .from(authAccounts)
    .where(
      and(
        eq(authAccounts.providerId, DISCORD_PROVIDER_ID),
        eq(authAccounts.accountId, discordUserIdStr),
      ),
    )
    .limit(1);

  if (!existingAccount) {
    await db.insert(authAccounts).values({
      id: `account-${betterAuthUserId}`,
      userId: betterAuthUserId,
      providerId: DISCORD_PROVIDER_ID,
      accountId: discordUserIdStr,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  const sessionId = `e2e-session-${randomUUID()}`;
  const sessionToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);

  await db.insert(authSessions).values({
    id: sessionId,
    userId: betterAuthUserId,
    token: sessionToken,
    expiresAt,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return { sessionToken, betterAuthUserId };
}

