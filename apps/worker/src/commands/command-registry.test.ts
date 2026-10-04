import { describe, expect, it, vi } from "vitest";
import { createLogger } from "@creatorcore/logger";
import { CommandRegistry } from "./command-registry.js";
import { PingCommand } from "./ping.command.js";
import { HelpCommand } from "./help.command.js";
import { ServerInfoCommand } from "./serverinfo.command.js";
import { BotInfoCommand } from "./botinfo.command.js";
import { createDefaultCommandRegistry } from "./index.js";
import type { ChatInputCommandInteraction } from "discord.js";

interface MockInteraction {
  commandName: string;
  guildId: string | null;
  guild: {
    id: string;
    name: string;
    ownerId: string;
    memberCount: number;
    createdTimestamp: number;
    premiumTier: number;
    premiumSubscriptionCount: number;
    preferredLocale: string;
    iconURL: () => string;
  } | null;
  client: {
    ws: { ping: number };
    user: { id: string; tag: string; displayAvatarURL: () => null };
    guilds: { cache: { size: number } };
  };
  replied: boolean;
  deferred: boolean;
  reply: ReturnType<typeof vi.fn>;
  deferReply: ReturnType<typeof vi.fn>;
  editReply: ReturnType<typeof vi.fn>;
};

function createMockInteraction(options: {
  commandName: string;
  inGuild?: boolean;
  replied?: boolean;
  deferred?: boolean;
}): MockInteraction {
  return {
    commandName: options.commandName,
    guildId: options.inGuild ? "1408151223076655104" : null,
    guild: options.inGuild
      ? {
          id: "1408151223076655104",
          name: "Test Guild",
          ownerId: "1234567890",
          memberCount: 150,
          createdTimestamp: 1700000000000,
          premiumTier: 2,
          premiumSubscriptionCount: 7,
          preferredLocale: "en-US",
          iconURL: () => "https://cdn.discordapp.com/icons/test/icon.png",
        }
      : null,
    client: {
      ws: { ping: 42 },
      user: { id: "987654321", tag: "CreatorBot#0001", displayAvatarURL: () => null },
      guilds: { cache: { size: 3 } },
    },
    replied: options.replied ?? false,
    deferred: options.deferred ?? false,
    reply: vi.fn().mockResolvedValue(undefined),
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
  };
}

function asChatInput(interaction: MockInteraction): ChatInputCommandInteraction {
  return interaction as unknown as ChatInputCommandInteraction;
}

describe("CommandRegistry", () => {
  const logger = createLogger({ service: "test-worker", level: "error" });

  it("registers and retrieves commands by name (case-insensitive)", () => {
    const registry = new CommandRegistry();
    const ping = new PingCommand();
    registry.register(ping);

    expect(registry.get("ping")).toBe(ping);
    expect(registry.get("PING")).toBe(ping);
    expect(registry.getAll()).toHaveLength(1);
  });

  it("throws an error when registering a duplicate command", () => {
    const registry = new CommandRegistry();
    registry.register(new PingCommand());

    expect(() => registry.register(new PingCommand())).toThrow('Command "ping" is already registered');
  });

  it("serializes commands to application command data correctly", () => {
    const registry = createDefaultCommandRegistry();
    const data = registry.toApplicationCommandData();

    expect(data.length).toBeGreaterThanOrEqual(4);
    const names = data.map((d) => (d as { name: string }).name);
    expect(names).toContain("ping");
    expect(names).toContain("help");
    expect(names).toContain("serverinfo");
    expect(names).toContain("botinfo");
  });

  it("dispatches known command successfully", async () => {
    const registry = new CommandRegistry();
    const executeSpy = vi.fn().mockResolvedValue(undefined);
    registry.register({
      name: "custom",
      description: "Custom test command",
      execute: executeSpy,
    });

    const mockInteraction = createMockInteraction({ commandName: "custom" });
    await registry.handleInteraction(asChatInput(mockInteraction), {
      botApplicationId: "bot-123",
      logger,
    });

    expect(executeSpy).toHaveBeenCalledOnce();
  });

  it("warns and replies with ephemeral error on unregistered command", async () => {
    const registry = new CommandRegistry();
    const mockInteraction = createMockInteraction({ commandName: "nonexistent" });

    await registry.handleInteraction(asChatInput(mockInteraction), {
      botApplicationId: "bot-123",
      logger,
    });

    expect(mockInteraction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        ephemeral: true,
      }),
    );
  });

  it("catches command execution failure and replies with safe error message", async () => {
    const registry = new CommandRegistry();
    registry.register({
      name: "failing",
      description: "Fails intentionally",
      execute: vi.fn().mockRejectedValue(new Error("Boom")),
    });

    const mockInteraction = createMockInteraction({ commandName: "failing" });
    await registry.handleInteraction(asChatInput(mockInteraction), {
      botApplicationId: "bot-123",
      logger,
    });

    expect(mockInteraction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("error occurred"),
        ephemeral: true,
      }),
    );
  });
});

describe("Core Slash Commands", () => {
  const logger = createLogger({ service: "test-worker", level: "error" });

  it("PingCommand defers and edits reply with latency embed", async () => {
    const ping = new PingCommand();
    const mockInteraction = createMockInteraction({ commandName: "ping" });

    await ping.execute(asChatInput(mockInteraction), {
      botApplicationId: "bot-123",
      logger,
      clientPing: 35,
    });

    expect(mockInteraction.deferReply).toHaveBeenCalled();
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.any(Array),
      }),
    );
  });

  it("HelpCommand replies with embed listing platform modules", async () => {
    const help = new HelpCommand();
    const mockInteraction = createMockInteraction({ commandName: "help" });

    await help.execute(asChatInput(mockInteraction), {
      botApplicationId: "bot-123",
      logger,
    });

    expect(mockInteraction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.any(Array),
      }),
    );
  });

  it("ServerInfoCommand displays guild details when executed in a server", async () => {
    const serverinfo = new ServerInfoCommand();
    const mockInteraction = createMockInteraction({ commandName: "serverinfo", inGuild: true });

    await serverinfo.execute(asChatInput(mockInteraction), {
      botApplicationId: "bot-123",
      logger,
    });

    expect(mockInteraction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.any(Array),
      }),
    );
  });

  it("ServerInfoCommand politely rejects when executed in DM", async () => {
    const serverinfo = new ServerInfoCommand();
    const mockInteraction = createMockInteraction({ commandName: "serverinfo", inGuild: false });

    await serverinfo.execute(asChatInput(mockInteraction), {
      botApplicationId: "bot-123",
      logger,
    });

    expect(mockInteraction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        ephemeral: true,
        content: expect.stringContaining("within a Discord server"),
      }),
    );
  });

  it("BotInfoCommand returns bot telemetry and uptime embed", async () => {
    const botinfo = new BotInfoCommand();
    const mockInteraction = createMockInteraction({ commandName: "botinfo" });

    await botinfo.execute(asChatInput(mockInteraction), {
      botApplicationId: "bot-123",
      logger,
    });

    expect(mockInteraction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.any(Array),
      }),
    );
  });
});
