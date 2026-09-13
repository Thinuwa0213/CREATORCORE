import { randomUUID } from "node:crypto";
import {
  assignEligibleWorkers,
  createBotApplicationPendingEligibility,
  createInitialActiveCredential,
  isDuplicateKeyError,
  reassignBotForGuild,
  recordAuditEvent,
  type DatabaseClient,
} from "@creatorcore/db";
import type { Logger } from "@creatorcore/logger";
import { encryptBotCredential, type CredentialEncryptionKeys } from "../lib/credential-crypto.js";
import type { DiscordValidator } from "./discord-validator.js";

export interface BotOnboardingServiceDeps {
  db: DatabaseClient["db"];
  keys: CredentialEncryptionKeys;
  logger: Logger;
  validator: DiscordValidator;
}

export interface OnboardBotApplicationInput {
  userId: bigint;
  tenantId: string;
  guildId: bigint;
  name: string;
  token: string;
}

export type OnboardBotApplicationResult =
  | { ok: true; botApplicationId: string }
  | { ok: false; reason: "CREDENTIAL_VALIDATION_FAILED" | "BOT_ALREADY_REGISTERED" };

/**
 * Failure-safe BotApplication onboarding (task Amendment 3). Authorization
 * (tenant membership, guild access, live Discord guild-manager
 * reverification) is the CALLER's responsibility (apps/api/src/routes/app) —
 * this service is purely the mechanical onboarding sequence, mirroring how
 * `CredentialService` itself never performs authz.
 *
 * Sequence, matching Amendment 3 exactly:
 * 1. Validate the token against Discord — network, outside any transaction.
 * 2. Pre-generate botApplicationId/credentialId and encrypt — CPU-only,
 *    outside any transaction.
 * 3. One DB transaction: create BotApplication (via
 *    `createBotApplicationPendingEligibility`, which does NOT auto-assign
 *    eligibility — see that function's own doc comment), persist the
 *    ACTIVE credential, attach the guild, THEN activate worker eligibility
 *    last, then audit. Any failure before commit rolls back everything —
 *    a BotApplication can never become worker-discoverable with a missing
 *    credential or guild attachment.
 *
 * Reuses the exact same `encryptBotCredential`/`createInitialActiveCredential`
 * primitives `CredentialService.storeInitialCredential` itself uses — not a
 * second encryption implementation, just a wider transaction boundary for
 * the one flow (initial onboarding) that genuinely needs one, since the
 * BotApplication doesn't exist yet and can't be `CredentialService`'s own
 * transaction unit.
 */
export class BotOnboardingService {
  constructor(private readonly deps: BotOnboardingServiceDeps) {}

  public async onboardBotApplication(
    input: OnboardBotApplicationInput,
  ): Promise<OnboardBotApplicationResult> {
    const validation = await this.deps.validator.validateToken(input.token);
    if (!validation.valid) {
      await recordAuditEvent(this.deps.db, {
        actorType: "USER",
        actorUserId: input.userId,
        tenantId: input.tenantId,
        guildId: input.guildId,
        targetType: "BotApplication",
        targetId: "pending",
        action: "credential.action_denied",
        outcome: "DENIED",
        metadata: { reason: validation.reason },
      });
      return { ok: false, reason: "CREDENTIAL_VALIDATION_FAILED" };
    }

    const discordApplicationId = BigInt(validation.user.id);
    const botApplicationId = randomUUID();
    const credentialId = randomUUID();
    const encrypted = encryptBotCredential(
      input.token,
      { botApplicationId, credentialId },
      this.deps.keys,
    );

    try {
      await this.deps.db.transaction(async (tx) => {
        await createBotApplicationPendingEligibility(
          tx,
          input.tenantId,
          discordApplicationId,
          input.name,
          botApplicationId,
        );
        await createInitialActiveCredential(tx, {
          id: credentialId,
          botApplicationId,
          ciphertext: encrypted.ciphertext,
          nonce: encrypted.nonce,
          authTag: encrypted.authTag,
          keyVersion: encrypted.keyVersion,
        });
        await reassignBotForGuild(tx, input.tenantId, input.guildId, botApplicationId);
        // Activated LAST, only once the credential and guild attachment
        // are already staged in this same transaction (Amendment 3's core
        // invariant).
        await assignEligibleWorkers(tx, botApplicationId);
        await recordAuditEvent(tx, {
          actorType: "USER",
          actorUserId: input.userId,
          tenantId: input.tenantId,
          guildId: input.guildId,
          targetType: "BotApplication",
          targetId: botApplicationId,
          action: "bot_application.created",
          outcome: "SUCCESS",
        });
        await recordAuditEvent(tx, {
          actorType: "USER",
          actorUserId: input.userId,
          tenantId: input.tenantId,
          guildId: input.guildId,
          targetType: "BotApplication",
          targetId: botApplicationId,
          action: "credential.configured",
          outcome: "SUCCESS",
        });
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        // discord_application_id is globally unique (bot_applications
        // schema) -- this specific Discord bot is already registered
        // somewhere in CreatorCore. Never silently adopt/merge it.
        await recordAuditEvent(this.deps.db, {
          actorType: "USER",
          actorUserId: input.userId,
          tenantId: input.tenantId,
          guildId: input.guildId,
          targetType: "BotApplication",
          targetId: "pending",
          action: "credential.action_denied",
          outcome: "DENIED",
          metadata: { reason: "BOT_ALREADY_REGISTERED" },
        });
        return { ok: false, reason: "BOT_ALREADY_REGISTERED" };
      }
      throw error;
    }

    return { ok: true, botApplicationId };
  }
}
