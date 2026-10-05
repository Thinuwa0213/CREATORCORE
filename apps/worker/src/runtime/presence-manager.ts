import fs from "node:fs/promises";
import path from "node:path";
import { ActivityType, PresenceUpdateStatus } from "discord.js";
import type { Logger } from "@creatorcore/logger";
import type { IDiscordClient } from "./discord-client.js";

export interface StoredActivity {
  id: string;
  type: string;
  text: string;
  streamUrl?: string;
}

export interface StoredPresence {
  statusMode?: "online" | "idle" | "dnd";
  rotationInterval?: number;
  activities?: StoredActivity[];
  updatedAt?: string;
}

function mapActivityType(type?: string): ActivityType {
  switch (type?.toUpperCase()) {
    case "WATCHING":
      return ActivityType.Watching;
    case "PLAYING":
      return ActivityType.Playing;
    case "LISTENING":
      return ActivityType.Listening;
    case "STREAMING":
      return ActivityType.Streaming;
    case "COMPETING":
      return ActivityType.Competing;
    default:
      return ActivityType.Playing;
  }
}

function mapStatus(status?: string): PresenceUpdateStatus {
  switch (status?.toLowerCase()) {
    case "idle":
      return PresenceUpdateStatus.Idle;
    case "dnd":
      return PresenceUpdateStatus.DoNotDisturb;
    case "online":
    default:
      return PresenceUpdateStatus.Online;
  }
}

export class PresenceManager {
  private timer?: NodeJS.Timeout | undefined;
  private currentIndex = 0;
  private isDestroyed = false;

  constructor(
    private readonly client: IDiscordClient,
    private readonly logger: Logger,
  ) {}

  public async start(): Promise<void> {
    this.isDestroyed = false;
    // Apply immediately upon ready
    await this.applyPresence();

    // Run rotation loop every 15s
    this.timer = setInterval(async () => {
      if (this.isDestroyed) return;
      await this.applyPresence();
    }, 15_000);
  }

  public stop(): void {
    this.isDestroyed = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private async findPresenceConfig(): Promise<StoredPresence | null> {
    try {
      const candidates: string[] = [
        path.resolve(process.cwd(), "storage", "tenants"),
        path.resolve(process.cwd(), "..", "..", "storage", "tenants"),
      ];
      let storageTenantsDir: string = candidates[0] ?? "";
      for (const dir of candidates) {
        try {
          await fs.access(dir);
          storageTenantsDir = dir;
          break;
        } catch {
          // try next candidate
        }
      }

      if (!storageTenantsDir) return null;

      const tenants = await fs.readdir(storageTenantsDir, { withFileTypes: true });
      for (const tenant of tenants) {
        if (!tenant.isDirectory()) continue;
        const guildsDir = path.join(storageTenantsDir, tenant.name, "guilds");
        try {
          const guilds = await fs.readdir(guildsDir, { withFileTypes: true });
          for (const guild of guilds) {
            if (!guild.isDirectory()) continue;
            const presenceFile = path.join(guildsDir, guild.name, "presence.json");
            try {
              const content = await fs.readFile(presenceFile, "utf-8");
              return JSON.parse(content) as StoredPresence;
            } catch {
              // try next
            }
          }
        } catch {
          // try next
        }
      }
    } catch (err) {
      this.logger.debug?.("presence-manager: error reading storage", { err });
    }
    return null;
  }

  private async applyPresence(): Promise<void> {
    if (!this.client.isReady() || !this.client.setPresence) {
      return;
    }

    const config = await this.findPresenceConfig();
    const status = mapStatus(config?.statusMode);
    const activities = Array.isArray(config?.activities) ? config.activities : [];

    if (activities.length === 0) {
      this.client.setPresence({
        status,
        activities: [],
      });
      return;
    }

    const activity = activities[this.currentIndex % activities.length];
    this.currentIndex++;

    if (!activity) {
      return;
    }

    this.client.setPresence({
      status,
      activities: [
        {
          name: activity.text,
          type: mapActivityType(activity.type),
          ...(activity.streamUrl ? { url: activity.streamUrl } : {}),
        },
      ],
    });

    this.logger.debug?.("presence-manager: presence updated on gateway", {
      status,
      activity: activity.text,
      type: activity.type,
    });
  }
}
