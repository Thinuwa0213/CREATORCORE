import fs from "node:fs/promises";
import path from "node:path";

export interface StoredPresenceData {
  statusMode: "online" | "idle" | "dnd";
  rotationInterval: number;
  activities: Array<{
    id: string;
    type: "WATCHING" | "PLAYING" | "LISTENING" | "STREAMING" | "COMPETING";
    text: string;
    streamUrl?: string;
  }>;
  updatedAt?: string;
}

function resolveStorageDir(): string {
  const cwd = process.cwd();
  if (cwd.endsWith("apps\\web") || cwd.endsWith("apps/web")) {
    return path.resolve(cwd, "..", "..", "storage");
  }
  return path.resolve(cwd, "storage");
}

export async function readStoredPresence(
  tenantId: string,
  guildId: string,
): Promise<StoredPresenceData | null> {
  try {
    const storageDir = resolveStorageDir();
    const filePath = path.join(storageDir, "tenants", tenantId, "guilds", guildId, "presence.json");
    const content = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(content);
    return {
      statusMode: parsed.statusMode ?? "online",
      rotationInterval: parsed.rotationInterval ?? 60,
      activities: Array.isArray(parsed.activities) ? parsed.activities : [],
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return null;
  }
}

export async function writeStoredPresence(
  tenantId: string,
  guildId: string,
  data: {
    statusMode: "online" | "idle" | "dnd";
    rotationInterval: number;
    activities: Array<{
      id: string;
      type: string;
      text: string;
      streamUrl?: string;
    }>;
  },
): Promise<StoredPresenceData> {
  const storageDir = resolveStorageDir();
  const dirPath = path.join(storageDir, "tenants", tenantId, "guilds", guildId);
  const filePath = path.join(dirPath, "presence.json");

  const validActivities = data.activities.map((act, index) => ({
    id: act.id || `act-${Date.now()}-${index}`,
    type: (["WATCHING", "PLAYING", "LISTENING", "STREAMING", "COMPETING"].includes(act.type)
      ? act.type
      : "PLAYING") as "WATCHING" | "PLAYING" | "LISTENING" | "STREAMING" | "COMPETING",
    text: typeof act.text === "string" ? act.text.slice(0, 128) : "",
    ...(act.streamUrl ? { streamUrl: String(act.streamUrl).slice(0, 256) } : {}),
  }));

  const payload: StoredPresenceData = {
    statusMode: data.statusMode,
    rotationInterval: data.rotationInterval,
    activities: validActivities,
    updatedAt: new Date().toISOString(),
  };

  await fs.mkdir(dirPath, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf-8");

  return payload;
}
