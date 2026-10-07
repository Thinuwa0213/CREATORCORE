import fs from "node:fs/promises";
import path from "node:path";
import {
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { CommandContext, SlashCommand } from "./command.interface.js";
import { getLevelFromXp, getLevelProgress } from "../runtime/level-calculator.js";
import type { StoredLevelConfig, StoredUserXp } from "../runtime/xp-manager.js";

async function findGuildDir(guildId: string): Promise<string | null> {
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

  try {
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
  } catch {
    // continue
  }

  return null;
}

export class DailyCommand implements SlashCommand {
  public readonly name = "daily";
  public readonly description = "Claim your free daily XP bonus once every 24 hours";

  public async execute(
    interaction: ChatInputCommandInteraction,
    _context: CommandContext,
  ): Promise<void> {
    const guild = interaction.guild;
    const author = interaction.user;

    if (!guild) {
      await interaction.reply({
        content: "❌ This command can only be used inside a Discord server.",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();

    const guildDir = await findGuildDir(guild.id);
    if (!guildDir) {
      await interaction.editReply({
        content: "❌ Leveling configuration not found for this server.",
      });
      return;
    }

    // Read config
    let config: StoredLevelConfig = { enabled: true };
    try {
      const configRaw = await fs.readFile(path.join(guildDir, "levels.json"), "utf-8");
      config = JSON.parse(configRaw) as StoredLevelConfig;
    } catch {
      // default config
    }

    if (!config.enabled) {
      await interaction.editReply({
        content: "⚠️ The XP & Leveling system is currently disabled on this server.",
      });
      return;
    }

    if (config.dailyXpEnabled === false) {
      await interaction.editReply({
        content: "⚠️ Daily XP rewards are currently disabled on this server.",
      });
      return;
    }

    // Load users
    const usersFile = path.join(guildDir, "levels-users.json");
    let usersMap: Record<string, StoredUserXp> = {};
    try {
      const usersRaw = await fs.readFile(usersFile, "utf-8");
      const parsed = JSON.parse(usersRaw);
      if (Array.isArray(parsed)) {
        for (const u of parsed) {
          if (u && u.userId) usersMap[u.userId] = u;
        }
      } else if (typeof parsed === "object" && parsed !== null) {
        usersMap = parsed as Record<string, StoredUserXp>;
      }
    } catch {
      usersMap = {};
    }

    const userData: StoredUserXp = usersMap[author.id] ?? {
      userId: author.id,
      username: author.username,
      avatarUrl: author.displayAvatarURL(),
      xp: 0,
      level: 0,
      lastXpAt: 0,
    };

    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;
    const lastDaily = userData.lastDailyAt ?? 0;

    // Check 24 hour cooldown
    if (lastDaily && now - lastDaily < DAY_MS) {
      const remainingMs = DAY_MS - (now - lastDaily);
      const hours = Math.floor(remainingMs / (60 * 60 * 1000));
      const minutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));

      const cooldownEmbed = new EmbedBuilder()
        .setColor(0xf59e0b) // Amber warning
        .setAuthor({
          name: author.username,
          iconURL: author.displayAvatarURL(),
        })
        .setTitle("⏳ Daily Reward Already Claimed!")
        .setDescription(
          `You've already claimed your daily XP reward for today!\n\nCome back in **${hours}h ${minutes}m** to claim your next bonus.`,
        )
        .setFooter({ text: "CreatorCore XP & Leveling Engine" })
        .setTimestamp();

      await interaction.editReply({ embeds: [cooldownEmbed] });
      return;
    }

    // Award daily XP
    const dailyAmount = config.dailyXpAmount ?? 100;
    const oldLevel = userData.level;
    const newTotalXp = userData.xp + dailyAmount;
    const newLevel = getLevelFromXp(newTotalXp);

    userData.xp = newTotalXp;
    userData.level = newLevel;
    userData.lastDailyAt = now;
    userData.lastXpAt = now;
    userData.username = author.username;
    userData.avatarUrl = author.displayAvatarURL();
    usersMap[author.id] = userData;

    await fs.writeFile(usersFile, JSON.stringify(Object.values(usersMap), null, 2), "utf-8");

    const progress = getLevelProgress(newTotalXp);

    const claimEmbed = new EmbedBuilder()
      .setColor(0x10b981) // Emerald celebration
      .setAuthor({
        name: `${author.username}'s Daily Bonus`,
        iconURL: author.displayAvatarURL(),
      })
      .setTitle("🎁 Daily XP Claimed!")
      .setDescription(
        `You've received **+${dailyAmount} XP** as your daily activity reward!\nCome back tomorrow for another bonus!`,
      )
      .addFields(
        {
          name: "⭐ Level",
          value: `\`Level ${newLevel}\``,
          inline: true,
        },
        {
          name: "⚡ Total XP",
          value: `\`${newTotalXp.toLocaleString()} XP\``,
          inline: true,
        },
        {
          name: "📈 Next Level Progress",
          value: `\`${progress.progressXp} / ${progress.neededXp} XP\` (${progress.percentage}%)`,
          inline: false,
        },
      )
      .setFooter({ text: "CreatorCore XP & Leveling Engine" })
      .setTimestamp();

    if (newLevel > oldLevel) {
      claimEmbed.addFields({
        name: "🎉 LEVEL UP!",
        value: `Congratulations, this daily reward promoted you to **Level ${newLevel}**!`,
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [claimEmbed] });
  }
}
