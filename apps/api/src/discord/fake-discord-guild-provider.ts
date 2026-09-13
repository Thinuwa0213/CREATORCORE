import {
  DiscordUnavailableError,
  type DiscordGuildProvider,
  type ManageableGuild,
} from "./types.js";

/**
 * Deterministic test double (task §29) — no real Discord calls in CI.
 * Scriptable per-user guild fixtures and an "unreachable" flag to exercise
 * fail-closed behavior on `DiscordUnavailableError`.
 */
export class FakeDiscordGuildProvider implements DiscordGuildProvider {
  private readonly guildsByUser = new Map<string, ManageableGuild[]>();
  private readonly unavailableUsers = new Set<string>();
  public liveCallCount = 0;

  setManageableGuilds(userId: bigint, guilds: ManageableGuild[]): void {
    this.guildsByUser.set(userId.toString(), guilds);
  }

  setUnavailable(userId: bigint, unavailable = true): void {
    if (unavailable) {
      this.unavailableUsers.add(userId.toString());
    } else {
      this.unavailableUsers.delete(userId.toString());
    }
  }

  async listManageableGuilds(userId: bigint): Promise<ManageableGuild[]> {
    this.liveCallCount += 1;
    if (this.unavailableUsers.has(userId.toString())) {
      throw new DiscordUnavailableError();
    }
    return this.guildsByUser.get(userId.toString()) ?? [];
  }

  async verifyCurrentGuildManager(userId: bigint, discordGuildId: bigint): Promise<boolean> {
    this.liveCallCount += 1;
    if (this.unavailableUsers.has(userId.toString())) {
      throw new DiscordUnavailableError();
    }
    const guilds = this.guildsByUser.get(userId.toString()) ?? [];
    return guilds.some((guild) => guild.id === discordGuildId);
  }
}
