import type { ChatInputCommandInteraction } from "discord.js";
import type { Logger } from "@creatorcore/logger";
import type { IDiscordClient } from "./discord-client.js";
import { type CommandRegistry, createDefaultCommandRegistry } from "../commands/index.js";
import { PresenceManager } from "./presence-manager.js";
import { WelcomeManager } from "./welcome-manager.js";

export interface BotRuntimeOptions {
  botApplicationId: string;
  credentialId: string;
  client: IDiscordClient;
  logger: Logger;
  readyTimeoutMs?: number;
  commandRegistry?: CommandRegistry;
  onFatalError?: (category: string) => void;
}

/**
 * Manages a single Discord Gateway client connection for a specific BotApplication.
 *
 * Security Guarantees & Memory Handling (Amendment 7):
 * - Plaintext bot tokens are never persisted on disk, in databases, or in instance fields.
 * - During start(token), the token string is provided strictly as a local parameter to
 *   client.login(token) and immediately falls out of scope.
 * - Plaintext tokens are never logged, serialized, or emitted in telemetry.
 * - Runtime references to the client are dropped on stop(), ensuring the underlying
 *   client and internal gateway state can be reclaimed by the JavaScript garbage collector.
 * - Honest memory limitation: In V8/Node.js, strings are immutable primitive values managed
 *   by the garbage collector and cannot be manually zeroed in memory (secure zeroization is
 *   impossible in pure JavaScript). CreatorCore guarantees zero retention beyond the immediate
 *   login invocation.
 */
export class BotRuntime {
  public readonly botApplicationId: string;
  public readonly credentialId: string;
  private client: IDiscordClient | null;
  private readonly logger: Logger;
  private readonly readyTimeoutMs: number;
  private readonly commandRegistry: CommandRegistry;
  private readonly onFatalError?: ((category: string) => void) | undefined;
  private interactionListener?: ((...args: unknown[]) => void) | undefined;
  private invalidatedListener?: (() => void) | undefined;
  private presenceManager?: PresenceManager | undefined;
  private welcomeManager?: WelcomeManager | undefined;
  private connected = false;

  constructor(options: BotRuntimeOptions) {
    this.botApplicationId = options.botApplicationId;
    this.credentialId = options.credentialId;
    this.client = options.client;
    this.logger = options.logger;
    this.readyTimeoutMs = options.readyTimeoutMs ?? 15_000;
    this.commandRegistry = options.commandRegistry ?? createDefaultCommandRegistry();
    this.onFatalError = options.onFatalError;
  }

  public isConnected(): boolean {
    return this.connected && (this.client?.isReady() ?? false);
  }

  /**
   * Connects to Discord Gateway using the provided token.
   * Resolves when the connection reaches READY state.
   * Plaintext token is scoped locally to this method execution and never retained.
   */
  public async start(token: string): Promise<void> {
    if (!this.client) {
      throw new Error("BotRuntime has been stopped or destroyed");
    }

    if (this.connected) {
      return;
    }

    const client = this.client;

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let timer: NodeJS.Timeout | undefined;

      const cleanupListeners = () => {
        if (timer) {
          clearTimeout(timer);
          timer = undefined;
        }
        client.removeListener("ready", onReady);
        client.removeListener("error", onError);
      };

      const onReady = async () => {
        if (settled) return;
        settled = true;
        cleanupListeners();
        this.connected = true;

        // Register slash commands if client supports application command registration
        if (typeof client.registerCommands === "function") {
          try {
            const commandData = this.commandRegistry.toApplicationCommandData();
            await client.registerCommands(commandData);
            this.logger.info("slash commands registered with discord", {
              botApplicationId: this.botApplicationId,
              commandCount: commandData.length,
            });
          } catch (regErr: unknown) {
            this.logger.warn("failed to register slash commands", {
              botApplicationId: this.botApplicationId,
              error: regErr instanceof Error ? regErr.message : String(regErr),
            });
          }
        }

        // Attach interaction listener for slash commands
        this.interactionListener = (interaction: unknown) => {
          if (interaction && typeof interaction === "object" && "isChatInputCommand" in interaction) {
            const chatInput = interaction as ChatInputCommandInteraction;
            if (chatInput.isChatInputCommand()) {
              this.commandRegistry
                .handleInteraction(chatInput, {
                  botApplicationId: this.botApplicationId,
                  logger: this.logger,
                  clientPing: typeof client.getPing === "function" ? client.getPing() : undefined,
                })
                .catch((dispatchErr: unknown) => {
                  this.logger.error("unhandled interaction dispatch error", {
                    botApplicationId: this.botApplicationId,
                    error: dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr),
                  });
                });
            }
          }
        };
        client.on("interactionCreate", this.interactionListener);

        this.invalidatedListener = () => {
          this.connected = false;
          this.logger.warn("discord bot session invalidated by gateway (token reset or revoked)", {
            botApplicationId: this.botApplicationId,
            credentialId: this.credentialId,
          });
          this.onFatalError?.("LOGIN_REJECTED");
        };
        client.on("invalidated", this.invalidatedListener);

        this.presenceManager = new PresenceManager(client, this.logger);
        void this.presenceManager.start();

        this.welcomeManager = new WelcomeManager(client, this.logger);
        void this.welcomeManager.start();

        this.logger.info("bot runtime connected and ready", {
          botApplicationId: this.botApplicationId,
          credentialId: this.credentialId,
        });
        resolve();
      };

      const onError = (err: unknown) => {
        if (settled) return;
        settled = true;
        cleanupListeners();
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn("bot runtime connection error", {
          botApplicationId: this.botApplicationId,
          credentialId: this.credentialId,
          error: message,
        });
        reject(err instanceof Error ? err : new Error(message));
      };

      timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanupListeners();
        this.logger.warn("bot runtime connection timed out waiting for ready", {
          botApplicationId: this.botApplicationId,
          credentialId: this.credentialId,
        });
        reject(new Error("Connection timed out waiting for Discord READY"));
      }, this.readyTimeoutMs);

      client.once("ready", onReady);
      client.once("error", onError);

      // Invoke client.login with token; token local variable is not referenced after this line
      client.login(token).catch((err) => {
        if (settled) return;
        settled = true;
        cleanupListeners();
        this.logger.warn("discord login rejected", {
          botApplicationId: this.botApplicationId,
          credentialId: this.credentialId,
          error: err instanceof Error ? err.message : String(err),
        });
        reject(err);
      });
    });
  }

  /**
   * Gracefully shuts down and destroys the Discord client connection.
   * Nulls out internal client references to enable garbage collection.
   */
  public async stop(): Promise<void> {
    this.connected = false;
    if (this.presenceManager) {
      this.presenceManager.stop();
      this.presenceManager = undefined;
    }
    if (this.welcomeManager) {
      this.welcomeManager.stop();
      this.welcomeManager = undefined;
    }
    if (this.client) {
      if (this.interactionListener) {
        this.client.removeListener("interactionCreate", this.interactionListener);
        this.interactionListener = undefined;
      }
      if (this.invalidatedListener) {
        this.client.removeListener("invalidated", this.invalidatedListener);
        this.invalidatedListener = undefined;
      }
      try {
        await this.client.destroy();
      } catch (err) {
        this.logger.warn("error while destroying discord client", {
          botApplicationId: this.botApplicationId,
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        // Drop client reference
        this.client = null;
      }
    }
    this.logger.info("bot runtime stopped and client destroyed", {
      botApplicationId: this.botApplicationId,
    });
  }
}
