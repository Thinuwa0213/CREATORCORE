import fs from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_WELCOME_CONFIG,
  DEFAULT_BANNER_LAYERS,
  type WelcomeConfig,
  type CanvasLayer,
} from "../app/tenants/[tenantId]/guilds/[guildId]/modules/welcome/welcome-types";

function resolveStorageDir(): string {
  const cwd = process.cwd();
  if (cwd.endsWith("apps\\web") || cwd.endsWith("apps/web")) {
    return path.resolve(cwd, "..", "..", "storage");
  }
  return path.resolve(cwd, "storage");
}

export async function readStoredWelcome(
  tenantId: string,
  guildId: string,
): Promise<WelcomeConfig> {
  try {
    const storageDir = resolveStorageDir();
    const filePath = path.join(storageDir, "tenants", tenantId, "guilds", guildId, "welcome.json");
    const content = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(content);

    const bannerConfig = parsed.bannerConfig || {};
    let layers: CanvasLayer[] = bannerConfig.layers;

    if (!Array.isArray(layers) || layers.length === 0) {
      layers = [
        ...(bannerConfig.avatar?.enabled !== false
          ? [
              {
                id: "layer-avatar",
                type: "avatar" as const,
                label: "Member Avatar",
                x: bannerConfig.avatar?.x ?? 0,
                y: bannerConfig.avatar?.y ?? -35,
                size: bannerConfig.avatar?.size ?? 84,
                shape: (bannerConfig.avatar?.rounded === "lg" ? "squircle" : "circle") as "circle" | "squircle",
                borderColor: bannerConfig.avatar?.borderColor ?? "#5865F2",
                borderWidth: bannerConfig.avatar?.borderWidth ?? 3,
              },
            ]
          : []),
        ...(bannerConfig.heading?.enabled !== false
          ? [
              {
                id: "layer-heading",
                type: "text" as const,
                label: "Welcome Heading",
                text: bannerConfig.heading?.text ?? "WELCOME TO THE SERVER",
                fontFamily: bannerConfig.heading?.fontFamily ?? "Inter",
                fontSize: bannerConfig.heading?.fontSize ?? 26,
                color: bannerConfig.heading?.color ?? "#FFFFFF",
                align: (bannerConfig.heading?.align ?? "center") as "left" | "center" | "right",
                x: bannerConfig.heading?.x ?? 0,
                y: bannerConfig.heading?.y ?? 30,
              },
            ]
          : []),
        ...(bannerConfig.subtext?.enabled !== false
          ? [
              {
                id: "layer-subtext",
                type: "text" as const,
                label: "Member Subtext",
                text: bannerConfig.subtext?.text ?? "{user.name} is member #{memberCount}",
                fontFamily: "Inter",
                fontSize: bannerConfig.subtext?.fontSize ?? 14,
                color: bannerConfig.subtext?.color ?? "#94A3B8",
                align: (bannerConfig.subtext?.align ?? "center") as "left" | "center" | "right",
                x: bannerConfig.subtext?.x ?? 0,
                y: bannerConfig.subtext?.y ?? 65,
              },
            ]
          : []),
      ];

      if (layers.length === 0) {
        layers = DEFAULT_BANNER_LAYERS;
      }
    }

    return {
      ...DEFAULT_WELCOME_CONFIG,
      ...parsed,
      bannerConfig: {
        ...DEFAULT_WELCOME_CONFIG.bannerConfig,
        ...bannerConfig,
        layers,
      },
    };
  } catch {
    return DEFAULT_WELCOME_CONFIG;
  }
}

export async function writeStoredWelcome(
  tenantId: string,
  guildId: string,
  data: WelcomeConfig,
): Promise<WelcomeConfig> {
  const storageDir = resolveStorageDir();
  const dirPath = path.join(storageDir, "tenants", tenantId, "guilds", guildId);
  const filePath = path.join(dirPath, "welcome.json");

  await fs.mkdir(dirPath, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");

  return data;
}
