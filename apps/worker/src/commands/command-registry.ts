import {
  ApplicationCommandType,
  type ChatInputCommandInteraction,
  type ApplicationCommandDataResolvable,
  type ChatInputApplicationCommandData,
} from "discord.js";
import type { CommandContext, SlashCommand } from "./command.interface.js";

export class CommandRegistry {
  private readonly commands = new Map<string, SlashCommand>();

  /**
   * Registers a slash command into the registry.
   */
  public register(command: SlashCommand): this {
    const normalizedName = command.name.toLowerCase().trim();
    if (this.commands.has(normalizedName)) {
      throw new Error(`Command "${normalizedName}" is already registered`);
    }
    this.commands.set(normalizedName, command);
    return this;
  }

  /**
   * Retrieves a command by name.
   */
  public get(name: string): SlashCommand | undefined {
    return this.commands.get(name.toLowerCase().trim());
  }

  /**
   * Returns all registered slash commands.
   */
  public getAll(): SlashCommand[] {
    return Array.from(this.commands.values());
  }

  /**
   * Serializes all registered commands for registration with the Discord Application Commands API.
   */
  public toApplicationCommandData(): ApplicationCommandDataResolvable[] {
    return this.getAll().map((cmd) => {
      if (cmd.toApplicationCommandData) {
        return cmd.toApplicationCommandData();
      }
      const data: ChatInputApplicationCommandData = {
        name: cmd.name,
        description: cmd.description,
        type: ApplicationCommandType.ChatInput,
        ...(cmd.options ? { options: cmd.options } : {}),
      };
      return data;
    });
  }

  /**
   * Safely handles an incoming chat input interaction.
   * Catches runtime execution failures and prevents crashes while informing the caller.
   */
  public async handleInteraction(
    interaction: ChatInputCommandInteraction,
    context: CommandContext,
  ): Promise<void> {
    const command = this.get(interaction.commandName);
    if (!command) {
      context.logger.warn("unregistered slash command invoked", {
        commandName: interaction.commandName,
        botApplicationId: context.botApplicationId,
        guildId: interaction.guildId ?? "DM",
      });

      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "❌ Unknown command or this module is not active on this server.",
          ephemeral: true,
        });
      }
      return;
    }

    try {
      await command.execute(interaction, context);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      context.logger.error("slash command execution failed", {
        commandName: interaction.commandName,
        botApplicationId: context.botApplicationId,
        guildId: interaction.guildId ?? "DM",
        error: errorMessage,
      });

      const responsePayload = {
        content: "⚠️ An error occurred while executing this command. Please try again later.",
        ephemeral: true,
      };

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(responsePayload).catch(() => undefined);
      } else {
        await interaction.reply(responsePayload).catch(() => undefined);
      }
    }
  }
}
