import { Client, GatewayIntentBits } from "discord.js";

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
}

export type DiscordClientFactory = () => IDiscordClient;

export const defaultDiscordClientFactory: DiscordClientFactory = () => new RealDiscordClient();
