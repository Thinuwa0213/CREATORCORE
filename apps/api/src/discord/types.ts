/**
 * A Discord guild the current user has Administrator or Manage Guild
 * authority over, per Discord's own permission bitfield (never inferred
 * from role names — docs/DISCORD_RULES.md).
 */
export interface ManageableGuild {
  id: bigint;
  name: string;
  icon?: string | null;
  owner?: boolean;
}

export class DiscordUnavailableError extends Error {
  constructor(message = "Discord API unavailable") {
    super(message);
    this.name = "DiscordUnavailableError";
  }
}

/**
 * The one interface every route/authz check goes through for Discord guild
 * authority (task §29 — no raw Discord fetch calls scattered across
 * routes). `listManageableGuilds` may be served from a short read-only
 * cache (ADR-0003's 5-minute bound); `verifyCurrentGuildManager` is always
 * live and must never be cache-served — it backs every sensitive action.
 * On any inability to reach Discord, implementations throw
 * `DiscordUnavailableError` rather than falling back to stale data
 * (fail closed).
 */
export interface DiscordGuildProvider {
  listManageableGuilds(userId: bigint): Promise<ManageableGuild[]>;
  verifyCurrentGuildManager(userId: bigint, discordGuildId: bigint): Promise<boolean>;
}
