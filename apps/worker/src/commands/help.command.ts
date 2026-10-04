import { EmbedBuilder, type ChatInputCommandInteraction } from "discord.js";
import type { CommandContext, SlashCommand } from "./command.interface.js";

export class HelpCommand implements SlashCommand {
  public readonly name = "help";
  public readonly description = "Explore available CreatorCore bot commands and modular features";

  public async execute(
    interaction: ChatInputCommandInteraction,
    _context: CommandContext,
  ): Promise<void> {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("✨ CreatorCore Bot Command Center")
      .setDescription(
        "Welcome to your server's branded Discord companion, powered by the CreatorCore platform.\n\n" +
          "Here are the active commands available for this server:",
      )
      .addFields(
        {
          name: "⚡ Core Utility Commands",
          value:
            "• `/ping` — View bot responsiveness & Gateway WebSocket latency\n" +
            "• `/help` — Overview of commands and platform status\n" +
            "• `/serverinfo` — Display analytics & statistics for this Discord server\n" +
            "• `/botinfo` — Details regarding bot runtime, uptime, and framework versions",
        },
        {
          name: "🧩 Modular Ecosystem (Configured via Dashboard)",
          value:
            "• **Welcome & Auto-Roles** — Automated onboarding for new community members\n" +
            "• **Auto Moderation** — Automated spam, bad words, and invite link filtering\n" +
            "• **Stream Alerts** — Real-time Twitch & YouTube broadcast notifications\n" +
            "• **XP & Levels** — Community engagement gamification and rewards",
        },
        {
          name: "🛠️ Server Management",
          value:
            "Server administrators can configure modules, custom branding, and triggers anytime from the CreatorCore Web Dashboard.",
        },
      )
      .setFooter({ text: "CreatorCore Platform • docs.creatorcore.dev" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
}
