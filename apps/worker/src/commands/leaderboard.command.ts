import fs from "node:fs/promises";
import path from "node:path";
import {
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { CommandContext, SlashCommand } from "./command.interface.js";
import type { StoredUserXp } from "../runtime/xp-manager.js";

async function findGuildUsers(guildId: string): Promise<StoredUserXp[]> {
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

  if (!storageTenantsDir) return [];

  try {
    const tenants = await fs.readdir(storageTenantsDir, { withFileTypes: true });
    for (const tenant of tenants) {
      if (!tenant.isDirectory()) continue;
      const usersFile = path.join(storageTenantsDir, tenant.name, "guilds", guildId, "levels-users.json");
      try {
        const content = await fs.readFile(usersFile, "utf-8");
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          return parsed as StoredUserXp[];
        }
        if (typeof parsed === "object" && parsed !== null) {
          return Object.values(parsed) as StoredUserXp[];
        }
      } catch {
        // continue
      }
    }
  } catch {
    // continue
  }

  return [];
}

async function isLevelingEnabled(guildId: string): Promise<boolean> {
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
          const parsed = JSON.parse(content);
          return parsed.enabled !== false;
        } catch {
          // continue
        }
      }
    } catch {
      // continue
    }
  }
  return true;
}

export class LeaderboardCommand implements SlashCommand {
  public readonly name = "leaderboard";
  public readonly description = "View the server's top XP & Level rankings";

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

    const enabled = await isLevelingEnabled(guild.id);
    if (!enabled) {
      await interaction.editReply({
        content: "⚠️ The XP & Leveling system is currently disabled on this server.",
      });
      return;
    }

    const users = await findGuildUsers(guild.id);
    users.sort((a, b) => b.xp - a.xp);

    const top10 = users.slice(0, 10);

    if (top10.length === 0) {
      const emptyEmbed = new EmbedBuilder()
        .setColor(0x6366f1)
        .setTitle(`🏆 ${guild.name} — XP Leaderboard`)
        .setDescription("No members have earned XP yet. Start chatting in text channels to rank up!")
        .setFooter({ text: "CreatorCore XP & Leveling Engine" })
        .setTimestamp();

      await interaction.editReply({ embeds: [emptyEmbed] });
      return;
    }

    const medals = ["🥇", "🥈", "🥉"];
    const lines = top10.map((u, i) => {
      const badge = i < 3 ? medals[i] : `**#${i + 1}**`;
      return `${badge} **${u.username}** — Level **${u.level}** (\`${u.xp.toLocaleString()} XP\`)`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x10b981) // Emerald accent for leaderboard
      .setTitle(`🏆 ${guild.name} — Top 10 Leaderboard`)
      .setDescription(lines.join("\n\n"))
      .addFields({
        name: "👥 Total Ranked Members",
        value: `\`${users.length} members\``,
        inline: true,
      })
      .setFooter({ text: "CreatorCore XP & Leveling Engine" })
      .setTimestamp();

    if (guild.iconURL()) {
      embed.setThumbnail(guild.iconURL()!);
    }

    await interaction.editReply({ embeds: [embed] });
  }
}
