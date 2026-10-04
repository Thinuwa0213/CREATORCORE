import { EmbedBuilder, type ChatInputCommandInteraction } from "discord.js";
import type { CommandContext, SlashCommand } from "./command.interface.js";

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

export class BotInfoCommand implements SlashCommand {
  public readonly name = "botinfo";
  public readonly description = "Display CreatorCore bot runtime details, uptime, and operational health";

  public async execute(
    interaction: ChatInputCommandInteraction,
    _context: CommandContext,
  ): Promise<void> {
    const client = interaction.client;
    const uptime = formatUptime(process.uptime());
    const memoryMB = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
    const guildsCount = client.guilds.cache.size;

    const embed = new EmbedBuilder()
      .setColor(0x8b5cf6)
      .setTitle("🤖 CreatorCore Bot Runtime Telemetry")
      .setThumbnail(client.user?.displayAvatarURL() ?? null)
      .addFields(
        {
          name: "🏷️ Bot Identity",
          value: `**${client.user?.tag ?? "Bot"}** (\`${client.user?.id ?? "N/A"}\`)`,
          inline: true,
        },
        {
          name: "⚙️ Engine",
          value: "CreatorCore Multi-Tenant v1.0",
          inline: true,
        },
        {
          name: "⏱️ System Uptime",
          value: `\`${uptime}\``,
          inline: true,
        },
        {
          name: "🏰 Guilds Active",
          value: `\`${guildsCount} server(s)\``,
          inline: true,
        },
        {
          name: "💾 Memory Heap",
          value: `\`${memoryMB} MB\``,
          inline: true,
        },
        {
          name: "📦 Stack Versions",
          value: `Node.js \`${process.version}\` • discord.js \`v14.27\``,
          inline: true,
        },
      )
      .setFooter({ text: "CreatorCore High-Availability Distributed Runtime" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
}
