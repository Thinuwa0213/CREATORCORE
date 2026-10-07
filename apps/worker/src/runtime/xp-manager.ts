import fs from "node:fs/promises";
import path from "node:path";
import {
  EmbedBuilder,
  type Message,
  type VoiceState,
} from "discord.js";
import type { Logger } from "@creatorcore/logger";
import type { IDiscordClient } from "./discord-client.js";
import { getLevelFromXp, getLevelProgress } from "./level-calculator.js";

export interface StoredLevelRoleReward {
  level: number;
  roleId: string;
  roleName: string;
}

export interface StoredRankCardConfig {
  enabled?: boolean;
  preset?: "landscape" | "ocean" | "midnight" | "blurple";
  customBgUrl?: string;
  progressBarColor?: string;
  circleColor?: string;
  textColor?: string;
  barTextColor?: string;
}

export interface StoredLevelConfig {
  enabled: boolean;
  xpMin?: number;
  xpMax?: number;
  cooldownSeconds?: number;
  announcementEnabled?: boolean;
  announcementChannelId?: string;
  announcementChannelName?: string;
  ignoredChannelIds?: string[];
  roleRewards?: StoredLevelRoleReward[];
  roleRewardsEnabled?: boolean;
  voiceXpEnabled?: boolean;
  voiceXpPerInterval?: number;
  voiceIntervalMinutes?: number;
  boosterMultiplierEnabled?: boolean;
  boosterMultiplier?: number;
  dailyXpEnabled?: boolean;
  dailyXpAmount?: number;
  rankCard?: StoredRankCardConfig;
}

export interface StoredUserXp {
  userId: string;
  username: string;
  avatarUrl?: string | null;
  xp: number;
  level: number;
  lastXpAt: number;
  lastDailyAt?: number;
}

export class XpManager {
  private messageListener?: ((...args: unknown[]) => void) | undefined;
  private voiceListener?: ((...args: unknown[]) => void) | undefined;
  private voiceSessions = new Map<string, number>();
  private isDestroyed = false;

  constructor(
    private readonly client: IDiscordClient,
    private readonly logger: Logger,
  ) {}

  public async start(): Promise<void> {
    this.isDestroyed = false;

    this.messageListener = (arg: unknown) => {
      if (this.isDestroyed) return;
      if (arg && typeof arg === "object" && "guild" in arg && "author" in arg) {
        const message = arg as Message;
        void this.handleMessage(message).catch((err: unknown) => {
          this.logger.error("xp-manager: unhandled error in handleMessage", {
            guildId: message.guild?.id ?? "unknown",
            authorId: message.author?.id ?? "unknown",
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    };

    this.voiceListener = (oldStateArg: unknown, newStateArg: unknown) => {
      if (this.isDestroyed) return;
      if (
        newStateArg &&
        typeof newStateArg === "object" &&
        "guild" in newStateArg &&
        "id" in newStateArg
      ) {
        const oldState = oldStateArg as VoiceState;
        const newState = newStateArg as VoiceState;
        void this.handleVoiceStateUpdate(oldState, newState).catch((err: unknown) => {
          this.logger.error("xp-manager: unhandled error in handleVoiceStateUpdate", {
            guildId: newState.guild?.id ?? "unknown",
            userId: newState.id ?? "unknown",
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    };

    this.client.on("messageCreate", this.messageListener);
    this.client.on("voiceStateUpdate", this.voiceListener);
    this.logger.info("xp-manager: listening for messageCreate and voiceStateUpdate events");
  }

  public stop(): void {
    this.isDestroyed = true;
    if (this.messageListener) {
      this.client.removeListener("messageCreate", this.messageListener);
      this.messageListener = undefined;
    }
    if (this.voiceListener) {
      this.client.removeListener("voiceStateUpdate", this.voiceListener);
      this.voiceListener = undefined;
    }
    this.voiceSessions.clear();
  }

  /**
   * Resolves storage path for a guild.
   */
  public async findGuildStorageDir(guildId: string): Promise<string | null> {
    try {
      const candidates: string[] = [
        path.resolve(process.cwd(), "storage", "tenants"),
        path.resolve(process.cwd(), "..", "..", "storage", "tenants"),
      ];
      let storageTenantsDir = "";
      for (const dir of candidates) {
        try {
          await fs.access(dir);
          storageTenantsDir = dir;
          break;
        } catch {
          // continue
        }
      }

      if (!storageTenantsDir) return null;

      const tenants = await fs.readdir(storageTenantsDir, { withFileTypes: true });
      for (const tenant of tenants) {
        if (!tenant.isDirectory()) continue;
        const guildDir = path.join(storageTenantsDir, tenant.name, "guilds", guildId);
        try {
          await fs.access(guildDir);
          return guildDir;
        } catch {
          // continue
        }
      }
    } catch (err) {
      this.logger.debug?.("xp-manager: error resolving storage dir", { guildId, err });
    }
    return null;
  }

  public async findLevelConfig(guildId: string): Promise<StoredLevelConfig | null> {
    const guildDir = await this.findGuildStorageDir(guildId);
    if (!guildDir) return null;

    const configFile = path.join(guildDir, "levels.json");
    try {
      const content = await fs.readFile(configFile, "utf-8");
      return JSON.parse(content) as StoredLevelConfig;
    } catch {
      return null;
    }
  }

  public async loadGuildUsers(guildDir: string): Promise<Record<string, StoredUserXp>> {
    const usersFile = path.join(guildDir, "levels-users.json");
    try {
      const content = await fs.readFile(usersFile, "utf-8");
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        const map: Record<string, StoredUserXp> = {};
        for (const item of parsed) {
          if (item && item.userId) map[item.userId] = item;
        }
        return map;
      }
      return parsed as Record<string, StoredUserXp>;
    } catch {
      return {};
    }
  }

  public async saveGuildUsers(guildDir: string, users: Record<string, StoredUserXp>): Promise<void> {
    const usersFile = path.join(guildDir, "levels-users.json");
    await fs.writeFile(usersFile, JSON.stringify(Object.values(users), null, 2), "utf-8");
  }

  public async handleMessage(message: Message): Promise<void> {
    const guild = message.guild;
    const author = message.author;

    // 1. Gatekeeper checks
    if (!guild || !author || author.bot) return;

    // 2. Fetch guild level configuration
    const config = await this.findLevelConfig(guild.id);
    if (!config || !config.enabled) return;

    // 3. Ignored channels check
    if (config.ignoredChannelIds && config.ignoredChannelIds.includes(message.channel.id)) {
      return;
    }

    // 4. Resolve guild storage dir
    const guildDir = await this.findGuildStorageDir(guild.id);
    if (!guildDir) return;

    // 5. Load user XP and perform cooldown check
    const users = await this.loadGuildUsers(guildDir);
    const existing = users[author.id] || {
      userId: author.id,
      username: author.username,
      avatarUrl: author.displayAvatarURL?.() ?? null,
      xp: 0,
      level: 0,
      lastXpAt: 0,
    };

    const now = Date.now();
    const cooldownSeconds = config.cooldownSeconds ?? 60;
    const cooldownMs = cooldownSeconds * 1000;

    if (existing.lastXpAt && now - existing.lastXpAt < cooldownMs) {
      return;
    }

    // 6. Award random XP (with Nitro booster multiplier if active)
    const minXp = config.xpMin ?? 15;
    const maxXp = Math.max(minXp, config.xpMax ?? 25);
    let awardedXp = Math.floor(Math.random() * (maxXp - minXp + 1)) + minXp;

    if (config.boosterMultiplierEnabled !== false && message.member?.premiumSince) {
      const multiplier = config.boosterMultiplier ?? 1.5;
      awardedXp = Math.round(awardedXp * multiplier);
    }

    const oldLevel = existing.level;
    const newTotalXp = existing.xp + awardedXp;
    const newLevel = getLevelFromXp(newTotalXp);

    existing.xp = newTotalXp;
    existing.level = newLevel;
    existing.lastXpAt = now;
    existing.username = author.username;
    existing.avatarUrl = author.displayAvatarURL?.() ?? null;
    users[author.id] = existing;

    await this.saveGuildUsers(guildDir, users);

    this.logger.debug?.("xp-manager: awarded XP to member", {
      guildId: guild.id,
      userId: author.id,
      awardedXp,
      newTotalXp,
      newLevel,
    });

    // 7. Detect and handle Level Up
    if (newLevel > oldLevel) {
      await this.handleLevelUp(message, config, oldLevel, newLevel);
    }
  }

  private async handleLevelUp(
    message: Message,
    config: StoredLevelConfig,
    oldLevel: number,
    newLevel: number,
  ): Promise<void> {
    const guild = message.guild;
    const member = message.member;
    const author = message.author;
    if (!guild || !member) return;

    this.logger.info("xp-manager: member leveled up", {
      guildId: guild.id,
      userId: author.id,
      oldLevel,
      newLevel,
    });

    // Check for automated role rewards matching milestone levels if enabled
    let newlyUnlockedRoleName: string | null = null;
    if (config.roleRewardsEnabled && config.roleRewards && config.roleRewards.length > 0) {
      for (const reward of config.roleRewards) {
        if (reward.level <= newLevel && reward.roleId) {
          try {
            const role =
              guild.roles.cache.get(reward.roleId) ??
              (await guild.roles.fetch(reward.roleId).catch(() => null));

            if (role && !member.roles.cache.has(role.id)) {
              await member.roles.add(role);
              newlyUnlockedRoleName = role.name;
              this.logger.info("xp-manager: granted milestone role reward", {
                guildId: guild.id,
                userId: author.id,
                roleId: role.id,
                roleName: role.name,
                level: reward.level,
              });
            }
          } catch (roleErr) {
            this.logger.warn("xp-manager: failed to grant level reward role", {
              guildId: guild.id,
              userId: author.id,
              roleId: reward.roleId,
              error: roleErr instanceof Error ? roleErr.message : String(roleErr),
            });
          }
        }
      }
    }

    // Send level-up announcement if enabled
    if (config.announcementEnabled !== false) {
      try {
        let targetChannel = message.channel;
        if (config.announcementChannelId) {
          const designated =
            guild.channels.cache.get(config.announcementChannelId) ??
            (await guild.channels.fetch(config.announcementChannelId).catch(() => null));
          if (designated && designated.isTextBased()) {
            targetChannel = designated;
          }
        }

        const progress = getLevelProgress(getLevelFromXp(newLevel));
        const embed = new EmbedBuilder()
          .setColor(0x6366f1) // Indigo accent
          .setAuthor({
            name: `${author.username} Leveled Up!`,
            iconURL: author.displayAvatarURL(),
          })
          .setTitle(`🎉 Level Up! Advanced to Level ${newLevel}`)
          .setDescription(
            `GG <@${author.id}>! You've reached **Level ${newLevel}** by being active in the community!` +
              (newlyUnlockedRoleName ? `\n\n🎖️ **New Role Unlocked:** \`@${newlyUnlockedRoleName}\`` : ""),
          )
          .addFields(
            {
              name: "🌟 New Level",
              value: `\`Level ${newLevel}\``,
              inline: true,
            },
            {
              name: "⚡ XP Progress",
              value: `\`${progress.progressXp} / ${progress.neededXp} XP\``,
              inline: true,
            },
          )
          .setFooter({ text: "CreatorCore XP & Leveling Engine" })
          .setTimestamp();

        if ("send" in targetChannel && typeof targetChannel.send === "function") {
          await targetChannel.send({ embeds: [embed] });
        }
      } catch (announcementErr) {
        this.logger.warn("xp-manager: failed to send level-up announcement", {
          guildId: guild.id,
          error: announcementErr instanceof Error ? announcementErr.message : String(announcementErr),
        });
      }
    }
  }

  public async handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
    const guild = newState.guild ?? oldState.guild;
    const member = newState.member ?? oldState.member;
    if (!guild || !member || member.user?.bot) return;

    const key = `${guild.id}:${member.id}`;
    const now = Date.now();

    const wasActive = Boolean(oldState.channelId && !oldState.deaf && !oldState.mute);
    const isActive = Boolean(newState.channelId && !newState.deaf && !newState.mute);

    if (isActive && !wasActive) {
      this.voiceSessions.set(key, now);
      return;
    }

    if (!isActive && wasActive) {
      const joinedAt = this.voiceSessions.get(key);
      this.voiceSessions.delete(key);
      if (!joinedAt) return;

      const durationMinutes = Math.floor((now - joinedAt) / 60000);
      if (durationMinutes < 1) return;

      const config = await this.findLevelConfig(guild.id);
      if (!config || !config.enabled || !config.voiceXpEnabled) return;

      const interval = Math.max(1, config.voiceIntervalMinutes ?? 5);
      const cycles = Math.floor(durationMinutes / interval);
      if (cycles < 1) return;

      const xpPerInterval = config.voiceXpPerInterval ?? 10;
      let awardedXp = cycles * xpPerInterval;

      // Apply Booster multiplier if active
      if (config.boosterMultiplierEnabled !== false && member.premiumSince) {
        awardedXp = Math.round(awardedXp * (config.boosterMultiplier ?? 1.5));
      }

      const guildDir = await this.findGuildStorageDir(guild.id);
      if (!guildDir) return;

      const users = await this.loadGuildUsers(guildDir);
      const existing = users[member.id] || {
        userId: member.id,
        username: member.user.username,
        avatarUrl: member.user.displayAvatarURL?.() ?? null,
        xp: 0,
        level: 0,
        lastXpAt: 0,
      };

      const oldLevel = existing.level;
      const newTotalXp = existing.xp + awardedXp;
      const newLevel = getLevelFromXp(newTotalXp);

      existing.xp = newTotalXp;
      existing.level = newLevel;
      existing.lastXpAt = now;
      existing.username = member.user.username;
      existing.avatarUrl = member.user.displayAvatarURL?.() ?? null;
      users[member.id] = existing;

      await this.saveGuildUsers(guildDir, users);

      this.logger.info("xp-manager: awarded voice XP to member", {
        guildId: guild.id,
        userId: member.id,
        durationMinutes,
        awardedXp,
        newLevel,
      });

      if (config.roleRewardsEnabled && newLevel > oldLevel && config.roleRewards) {
        for (const reward of config.roleRewards) {
          if (reward.level <= newLevel && reward.roleId) {
            try {
              const role =
                guild.roles.cache.get(reward.roleId) ??
                (await guild.roles.fetch(reward.roleId).catch(() => null));
              if (role && !member.roles.cache.has(role.id)) {
                await member.roles.add(role);
              }
            } catch {
              // ignore role errors
            }
          }
        }
      }
    }
  }
}
