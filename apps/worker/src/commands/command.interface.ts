import type {
  ChatInputCommandInteraction,
  ApplicationCommandDataResolvable,
  ApplicationCommandOptionData,
} from "discord.js";
import type { Logger } from "@creatorcore/logger";

export interface CommandContext {
  botApplicationId: string;
  logger: Logger;
  clientPing?: number | undefined;
}

export interface SlashCommand {
  /**
   * Command identifier matching Discord slash command format (lowercase, no spaces, 1-32 chars).
   */
  readonly name: string;

  /**
   * Explanatory text shown to Discord users in the slash command autocomplete menu.
   */
  readonly description: string;

  /**
   * Optional slash command parameters/arguments.
   */
  readonly options?: ApplicationCommandOptionData[];

  /**
   * Primary command execution handler.
   */
  execute(interaction: ChatInputCommandInteraction, context: CommandContext): Promise<void>;

  /**
   * Converts this slash command definition into Discord.js ApplicationCommandDataResolvable.
   */
  toApplicationCommandData?(): ApplicationCommandDataResolvable;
}
