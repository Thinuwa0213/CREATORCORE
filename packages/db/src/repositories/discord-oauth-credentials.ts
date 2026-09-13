import { eq, sql } from "drizzle-orm";
import { discordOauthCredentials } from "../schema/index.js";
import type { Db } from "../types.js";

export interface DiscordOauthCredentialRow {
  accountId: bigint;
  ciphertext: Buffer;
  nonce: Buffer;
  authTag: Buffer;
  keyVersion: number;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DiscordOauthCredentialInput {
  accountId: bigint;
  ciphertext: Buffer;
  nonce: Buffer;
  authTag: Buffer;
  keyVersion: number;
  expiresAt: Date | null;
}

/**
 * Creates or fully replaces the stored Discord OAuth credential for a user.
 * Used only by the `account.create.before` database hook (apps/api/src/auth)
 * at first-ever Discord sign-in, where full identity is proven present —
 * see the Phase 5 design doc's Step 0 finding on why `update.before` never
 * calls this.
 */
export async function upsertDiscordOauthCredential(
  db: Db,
  input: DiscordOauthCredentialInput,
): Promise<void> {
  await db
    .insert(discordOauthCredentials)
    .values({
      accountId: input.accountId,
      ciphertext: input.ciphertext,
      nonce: input.nonce,
      authTag: input.authTag,
      keyVersion: input.keyVersion,
      expiresAt: input.expiresAt,
    })
    .onDuplicateKeyUpdate({
      set: {
        ciphertext: input.ciphertext,
        nonce: input.nonce,
        authTag: input.authTag,
        keyVersion: input.keyVersion,
        expiresAt: input.expiresAt,
        updatedAt: sql`now()`,
      },
    });
}

export async function findDiscordOauthCredential(
  db: Db,
  accountId: bigint,
): Promise<DiscordOauthCredentialRow | undefined> {
  const [row] = await db
    .select()
    .from(discordOauthCredentials)
    .where(eq(discordOauthCredentials.accountId, accountId))
    .limit(1);

  return row as DiscordOauthCredentialRow | undefined;
}

/**
 * Writes a refreshed credential back, but only if no concurrent refresh
 * already won the race (optimistic check against the `updatedAt` value read
 * before the Discord network call). If another request already refreshed
 * this row in the meantime, this is a safe no-op — the caller re-reads and
 * uses the winner's credential instead (see `DiscordGuildProvider`,
 * apps/api/src/discord). No row lock is held at any point: the live
 * Discord network call never happens inside a transaction (security-review
 * M2's principle), and this optimistic compare-and-swap is sufficient to
 * serialize conflicting writes without one.
 */
export async function replaceDiscordOauthCredentialIfUnchanged(
  db: Db,
  accountId: bigint,
  expectedUpdatedAt: Date,
  next: DiscordOauthCredentialInput,
): Promise<{ ok: boolean }> {
  const result = await db
    .update(discordOauthCredentials)
    .set({
      ciphertext: next.ciphertext,
      nonce: next.nonce,
      authTag: next.authTag,
      keyVersion: next.keyVersion,
      expiresAt: next.expiresAt,
      updatedAt: sql`now()`,
    })
    .where(
      sql`${discordOauthCredentials.accountId} = ${accountId} and ${discordOauthCredentials.updatedAt} = ${expectedUpdatedAt}`,
    );

  return { ok: result[0].affectedRows > 0 };
}
