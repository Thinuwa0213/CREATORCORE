import fs from "node:fs/promises";
import path from "node:path";

export interface LevelRoleReward {
  level: number;
  roleId: string;
  roleName: string;
}

export interface RankCardConfig {
  enabled: boolean;
  preset: "landscape" | "ocean" | "midnight" | "blurple";
  customBgUrl?: string | undefined;
  progressBarColor: string;
  circleColor: string;
  textColor: string;
  barTextColor: string;
}

export const DEFAULT_RANK_CARD_CONFIG: RankCardConfig = {
  enabled: true,
  preset: "landscape",
  progressBarColor: "#5865f2",
  circleColor: "#5865f2",
  textColor: "#ffffff",
  barTextColor: "#ffffff",
};

export interface LevelSettings {
  enabled: boolean;
  xpMin: number;
  xpMax: number;
  cooldownSeconds: number;
  announcementEnabled: boolean;
  announcementChannelId?: string | undefined;
  announcementChannelName?: string | undefined;
  ignoredChannelIds: string[];
  roleRewards: LevelRoleReward[];
  roleRewardsEnabled?: boolean | undefined;
  voiceXpEnabled?: boolean | undefined;
  voiceXpPerInterval?: number | undefined;
  voiceIntervalMinutes?: number | undefined;
  boosterMultiplierEnabled?: boolean | undefined;
  boosterMultiplier?: number | undefined;
  dailyXpEnabled?: boolean | undefined;
  dailyXpAmount?: number | undefined;
  rankCard?: RankCardConfig | undefined;
}

export interface UserXpRecord {
  userId: string;
  username: string;
  avatarUrl?: string | null;
  xp: number;
  level: number;
  lastXpAt: number;
  lastDailyAt?: number | undefined;
}

export const DEFAULT_LEVEL_SETTINGS: LevelSettings = {
  enabled: true,
  xpMin: 15,
  xpMax: 25,
  cooldownSeconds: 60,
  announcementEnabled: true,
  announcementChannelId: "",
  announcementChannelName: "",
  ignoredChannelIds: [],
  roleRewardsEnabled: false,
  roleRewards: [],
  voiceXpEnabled: false,
  voiceXpPerInterval: 10,
  voiceIntervalMinutes: 5,
  boosterMultiplierEnabled: true,
  boosterMultiplier: 1.5,
  dailyXpEnabled: true,
  dailyXpAmount: 100,
  rankCard: DEFAULT_RANK_CARD_CONFIG,
};

function resolveStorageDir(): string {
  const cwd = process.cwd();
  if (cwd.endsWith("apps\\web") || cwd.endsWith("apps/web")) {
    return path.resolve(cwd, "..", "..", "storage");
  }
  return path.resolve(cwd, "storage");
}

export async function readStoredLevelSettings(
  tenantId: string,
  guildId: string,
): Promise<LevelSettings> {
  try {
    const storageDir = resolveStorageDir();
    const filePath = path.join(storageDir, "tenants", tenantId, "guilds", guildId, "levels.json");
    const content = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(content);
    // Sanitize any legacy fallback dummy roles (r-regular, r-veteran, etc.)
    const cleanRoleRewards = Array.isArray(parsed.roleRewards)
      ? parsed.roleRewards.filter((r: LevelRoleReward) => r && !r.roleId.startsWith("r-"))
      : [];

    return {
      ...DEFAULT_LEVEL_SETTINGS,
      ...parsed,
      roleRewards: cleanRoleRewards,
    };
  } catch {
    return DEFAULT_LEVEL_SETTINGS;
  }
}

export async function writeStoredLevelSettings(
  tenantId: string,
  guildId: string,
  data: LevelSettings,
): Promise<LevelSettings> {
  const storageDir = resolveStorageDir();
  const dirPath = path.join(storageDir, "tenants", tenantId, "guilds", guildId);
  const filePath = path.join(dirPath, "levels.json");

  await fs.mkdir(dirPath, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");

  return data;
}

export async function readStoredGuildUsers(
  tenantId: string,
  guildId: string,
): Promise<UserXpRecord[]> {
  try {
    const storageDir = resolveStorageDir();
    const filePath = path.join(storageDir, "tenants", tenantId, "guilds", guildId, "levels-users.json");
    const content = await fs.readFile(filePath, "utf-8");
    const users = JSON.parse(content);
    if (Array.isArray(users)) return users;
    if (typeof users === "object" && users !== null) return Object.values(users);
    return [];
  } catch {
    return [];
  }
}

export async function writeStoredGuildUsers(
  tenantId: string,
  guildId: string,
  users: UserXpRecord[],
): Promise<void> {
  const storageDir = resolveStorageDir();
  const dirPath = path.join(storageDir, "tenants", tenantId, "guilds", guildId);
  const filePath = path.join(dirPath, "levels-users.json");

  await fs.mkdir(dirPath, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(users, null, 2), "utf-8");
}
