import { Client, GatewayIntentBits, type ApplicationCommandDataResolvable } from "discord.js";

/**
 * Interface abstracting Discord Gateway Client capabilities needed by CreatorCore.
 * Allows deterministic unit and integration testing with fake clients.
 */
export interface IDiscordClient {
  login(token: string): Promise<string>;
  destroy(): Promise<void> | void;
  isReady(): boolean;
  on(event: string, listener: (...args: unknown[]) => void): this;
  once(event: string, listener: (...args: unknown[]) => void): this;
  removeListener(event: string, listener: (...args: unknown[]) => void): this;
  registerCommands?(commands: unknown[]): Promise<void>;
  getPing?(): number;
  setPresence?(presence: unknown): unknown;
}

/**
 * Real Discord.js Client implementation with minimal intents (GatewayIntentBits.Guilds).
 * No privileged intents are requested at this foundation phase.
 */
export class RealDiscordClient implements IDiscordClient {
  private client: Client;

  constructor() {
    this.client = new Client({
      intents: [GatewayIntentBits.Guilds],
    });
  }

  public async login(token: string): Promise<string> {
    return this.client.login(token);
  }

  public async destroy(): Promise<void> {
    await this.client.destroy();
  }

  public isReady(): boolean {
    return this.client.isReady();
  }

  public on(event: string, listener: (...args: unknown[]) => void): this {
    this.client.on(event, listener);
    return this;
  }

  public once(event: string, listener: (...args: unknown[]) => void): this {
    this.client.once(event, listener);
    return this;
  }

  public removeListener(event: string, listener: (...args: unknown[]) => void): this {
    this.client.removeListener(event, listener);
    return this;
  }

  /**
   * Registers slash commands with the Discord Application Commands API.
   * Also seeds connected guilds so commands update immediately in Discord without delay.
   */
  public async registerCommands(commands: unknown[]): Promise<void> {
    const commandList = commands as ApplicationCommandDataResolvable[];
    if (this.client.application) {
      await this.client.application.commands.set(commandList);
    }

    for (const guild of this.client.guilds.cache.values()) {
      try {
        await guild.commands.set(commandList);
      } catch {
        // Guild-level registration is best effort
      }
    }
  }

  public getPing(): number {
    return this.client.ws.ping;
  }

  public setPresence(presence: unknown): unknown {
    if (!this.client.user) return;
    return this.client.user.setPresence(presence as any);
  }
}

export type DiscordClientFactory = () => IDiscordClient;

export const defaultDiscordClientFactory: DiscordClientFactory = () => new RealDiscordClient();
