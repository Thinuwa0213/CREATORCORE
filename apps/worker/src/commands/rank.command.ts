import fs from "node:fs/promises";
import path from "node:path";
import {
  ApplicationCommandOptionType,
  AttachmentBuilder,
  EmbedBuilder,
  type ApplicationCommandOptionData,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { CommandContext, SlashCommand } from "./command.interface.js";
import { getLevelProgress, generateProgressBar } from "../runtime/level-calculator.js";
import type { StoredLevelConfig, StoredUserXp } from "../runtime/xp-manager.js";
import { renderRankCard } from "../runtime/rank-card-renderer.js";

async function findGuildUsers(guildId: string): Promise<Record<string, StoredUserXp>> {
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

  if (!storageTenantsDir) return {};

  try {
    const tenants = await fs.readdir(storageTenantsDir, { withFileTypes: true });
    for (const tenant of tenants) {
      if (!tenant.isDirectory()) continue;
      const usersFile = path.join(storageTenantsDir, tenant.name, "guilds", guildId, "levels-users.json");
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
        // continue
      }
    }
  } catch {
    // continue
  }

  return {};
}

async function findGuildLevelConfig(guildId: string): Promise<StoredLevelConfig | null> {
  const candidates: string[] = [
    path.resolve(process.cwd(), "storage", "tenants"),
    path.resolve(process.cwd(), "..", "..", "storage", "tenants"),
  ];
  for (const root of candidates) {
    try {
      const tenants = await fs.readdir(root, { withFileTypes: true });
      for (const tenant of tenants) {
        if (!tenant.isDirectory()) continue;
        const file = path.join(root, tenant.name, "guilds", guildId, "levels.json");
        try {
          const content = await fs.readFile(file, "utf-8");
          return JSON.parse(content) as StoredLevelConfig;
        } catch {
          // continue
        }
      }
    } catch {
      // continue
    }
  }
  return null;
}

export class RankCommand implements SlashCommand {
  public readonly name = "rank";
  public readonly description = "Check your or another member's current XP, level, and server rank";

  public readonly options: ApplicationCommandOptionData[] = [
    {
      name: "user",
      description: "The member whose rank you want to check (defaults to yourself)",
      type: ApplicationCommandOptionType.User,
      required: false,
    },
  ];

  public async execute(
    interaction: ChatInputCommandInteraction,
    _context: CommandContext,
  ): Promise<void> {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({
        content: "❌ This command can only be used inside a Discord server.",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();

    const config = await findGuildLevelConfig(guild.id);
    if (config && config.enabled === false) {
      await interaction.editReply({
        content: "⚠️ The XP & Leveling system is currently disabled on this server.",
      });
      return;
    }

    const targetUser = interaction.options.getUser("user") ?? interaction.user;
    const usersMap = await findGuildUsers(guild.id);

    // Compute rank position
    const sortedUsers = Object.values(usersMap).sort((a, b) => b.xp - a.xp);
    const userIndex = sortedUsers.findIndex((u) => u.userId === targetUser.id);
    const rank = userIndex >= 0 ? userIndex + 1 : sortedUsers.length + 1;

    const userData: StoredUserXp = usersMap[targetUser.id] ?? {
      userId: targetUser.id,
      username: targetUser.username,
      avatarUrl: targetUser.displayAvatarURL(),
      xp: 0,
      level: 0,
      lastXpAt: 0,
    };

    const progress = getLevelProgress(userData.xp);

    // If Rank Card image rendering is enabled, render and send canvas image
    const rankCardConfig = config?.rankCard;
    const isImageCardEnabled = rankCardConfig?.enabled !== false;

    if (isImageCardEnabled) {
      try {
        const avatarUrl = targetUser.displayAvatarURL({ extension: "png", size: 256 });
        const cardBuffer = await renderRankCard({
          username: targetUser.username,
          avatarUrl,
          rank,
          level: progress.level,
          totalXp: userData.xp,
          progressXp: progress.progressXp,
          neededXp: progress.neededXp,
          percentage: progress.percentage,
          config: rankCardConfig,
        });

        const attachment = new AttachmentBuilder(cardBuffer, { name: "rank-card.png" });
        await interaction.editReply({ files: [attachment] });
        return;
      } catch {
        // Fallback to text embed if image rendering fails
      }
    }

    // Text Embed fallback
    const progressBar = generateProgressBar(progress.percentage, 12);
    const embed = new EmbedBuilder()
      .setColor(0x6366f1)
      .setAuthor({
        name: `${targetUser.username}'s Rank Card`,
        iconURL: targetUser.displayAvatarURL(),
      })
      .setTitle(`🏆 Server Rank #${rank}`)
      .setThumbnail(targetUser.displayAvatarURL())
      .addFields(
        {
          name: "⭐ Level",
          value: `\`Level ${progress.level}\``,
          inline: true,
        },
        {
          name: "⚡ Total XP",
          value: `\`${userData.xp.toLocaleString()} XP\``,
          inline: true,
        },
        {
          name: "🏅 Server Position",
          value: `\`#${rank} of ${Math.max(sortedUsers.length, 1)}\``,
          inline: true,
        },
        {
          name: "📈 Level Progress",
          value: `\`${progress.progressXp.toLocaleString()} / ${progress.neededXp.toLocaleString()} XP\` (${progress.percentage}%)\n\`${progressBar}\``,
          inline: false,
        },
      )
      .setFooter({ text: "CreatorCore XP & Leveling Engine" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
}
