import { EmbedBuilder, type ChatInputCommandInteraction } from "discord.js";
import type { CommandContext, SlashCommand } from "./command.interface.js";

export class ServerInfoCommand implements SlashCommand {
  public readonly name = "serverinfo";
  public readonly description = "Display analytics, statistics, and details about this Discord server";

  public async execute(
    interaction: ChatInputCommandInteraction,
    _context: CommandContext,
  ): Promise<void> {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({
        content: "❌ The `/serverinfo` command can only be executed within a Discord server.",
        ephemeral: true,
      });
      return;
    }

    const createdAt = `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`;
    const memberCount = guild.memberCount?.toLocaleString() ?? "Unknown";
    const boostTier = guild.premiumTier > 0 ? `Level ${guild.premiumTier}` : "None";
    const boostCount = guild.premiumSubscriptionCount ?? 0;

    const embed = new EmbedBuilder()
      .setColor(0x3b82f6)
      .setTitle(`📊 Server Analytics: ${guild.name}`)
      .setThumbnail(guild.iconURL({ size: 256 }) ?? null)
      .addFields(
        {
          name: "🆔 Server ID",
          value: `\`${guild.id}\``,
          inline: true,
        },
        {
          name: "👑 Owner",
          value: `<@${guild.ownerId}>`,
          inline: true,
        },
        {
          name: "👥 Total Members",
          value: `\`${memberCount}\``,
          inline: true,
        },
        {
          name: "📅 Created",
          value: createdAt,
          inline: true,
        },
        {
          name: "🚀 Server Boosts",
          value: `${boostTier} (${boostCount} boosts)`,
          inline: true,
        },
        {
          name: "🌐 Preferred Locale",
          value: `\`${guild.preferredLocale}\``,
          inline: true,
        },
      )
      .setFooter({ text: "CreatorCore Guild Analytics" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
}
