export * from "./command.interface.js";
export * from "./command-registry.js";
export * from "./ping.command.js";
export * from "./help.command.js";
export * from "./serverinfo.command.js";
export * from "./botinfo.command.js";

import { CommandRegistry } from "./command-registry.js";
import { PingCommand } from "./ping.command.js";
import { HelpCommand } from "./help.command.js";
import { ServerInfoCommand } from "./serverinfo.command.js";
import { BotInfoCommand } from "./botinfo.command.js";

/**
 * Creates and initializes a CommandRegistry with default core commands.
 */
export function createDefaultCommandRegistry(): CommandRegistry {
  const registry = new CommandRegistry();
  registry.register(new PingCommand());
  registry.register(new HelpCommand());
  registry.register(new ServerInfoCommand());
  registry.register(new BotInfoCommand());
  return registry;
}
