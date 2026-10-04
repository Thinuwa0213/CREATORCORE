import { EmbedBuilder, type ChatInputCommandInteraction } from "discord.js";
import type { CommandContext, SlashCommand } from "./command.interface.js";

export class PingCommand implements SlashCommand {
  public readonly name = "ping";
  public readonly description = "Check bot latency and Discord API WebSocket response time";

  public async execute(
    interaction: ChatInputCommandInteraction,
    context: CommandContext,
  ): Promise<void> {
    const startTime = Date.now();
    await interaction.deferReply();
    const roundTripLatency = Date.now() - startTime;
    const wsPing = context.clientPing ?? interaction.client.ws.ping;

    const embed = new EmbedBuilder()
      .setColor(0x10b981)
      .setTitle("🏓 Pong!")
      .setDescription("CreatorCore Bot Runtime is fully operational.")
      .addFields(
        {
          name: "⏱️ Roundtrip Latency",
          value: `\`${roundTripLatency}ms\``,
          inline: true,
        },
        {
          name: "🌐 Gateway Ping",
          value: `\`${wsPing >= 0 ? wsPing : 0}ms\``,
          inline: true,
        },
        {
          name: "🟢 Runtime State",
          value: "`ACTIVE / ONLINE`",
          inline: true,
        },
      )
      .setFooter({ text: "CreatorCore Multi-Tenant Bot Engine" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
}
