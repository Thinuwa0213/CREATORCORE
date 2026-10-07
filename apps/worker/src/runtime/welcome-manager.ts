import fs from "node:fs/promises";
import path from "node:path";
import { createCanvas, loadImage, type Image } from "@napi-rs/canvas";
import {
  AttachmentBuilder,
  type GuildMember,
} from "discord.js";
import type { Logger } from "@creatorcore/logger";
import type { IDiscordClient } from "./discord-client.js";

export interface StoredWelcomeConfig {
  enabled: boolean;
  channelId?: string;
  channelName?: string;
  message?: string;
  pingUser?: boolean;
  sendDm?: boolean;
  ignoreBots?: boolean;
  autoRoleEnabled?: boolean;
  autoRoleId?: string;
  autoRoleName?: string;
  customCanvasCard?: boolean;
  rulesGate?: boolean;
  bannerConfig?: {
    bgType?: "gradient" | "image";
    bgImageUrl?: string | null;
    bgGradient?: string;
    overlayOpacity?: number;
    layers?: unknown[];
  };
}

export class WelcomeManager {
  private memberAddListener?: ((...args: unknown[]) => void) | undefined;
  private isDestroyed = false;

  constructor(
    private readonly client: IDiscordClient,
    private readonly logger: Logger,
  ) {}

  public async start(): Promise<void> {
    this.isDestroyed = false;

    this.memberAddListener = (arg: unknown) => {
      if (this.isDestroyed) return;
      if (arg && typeof arg === "object" && "guild" in arg && "user" in arg) {
        const member = arg as GuildMember;
        void this.handleMemberAdd(member).catch((err: unknown) => {
          this.logger.error("welcome-manager: unhandled error in handleMemberAdd", {
            guildId: member.guild?.id,
            memberId: member.id,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    };

    this.client.on("guildMemberAdd", this.memberAddListener);
    this.logger.info("welcome-manager: listening for guildMemberAdd events");
  }

  public stop(): void {
    this.isDestroyed = true;
    if (this.memberAddListener) {
      this.client.removeListener("guildMemberAdd", this.memberAddListener);
      this.memberAddListener = undefined;
    }
  }

  private async findWelcomeConfig(guildId: string): Promise<StoredWelcomeConfig | null> {
    try {
      const candidates: string[] = [
        path.resolve(process.cwd(), "storage", "tenants"),
        path.resolve(process.cwd(), "..", "..", "storage", "tenants"),
      ];
      let storageTenantsDir = "";
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
        const welcomeFile = path.join(storageTenantsDir, tenant.name, "guilds", guildId, "welcome.json");
        try {
          const content = await fs.readFile(welcomeFile, "utf-8");
          return JSON.parse(content) as StoredWelcomeConfig;
        } catch {
          // try next tenant
        }
      }
    } catch (err) {
      this.logger.debug?.("welcome-manager: error searching storage", { guildId, err });
    }
    return null;
  }

  public async handleMemberAdd(member: GuildMember): Promise<void> {
    const guild = member.guild;
    if (!guild) return;

    this.logger.info("welcome-manager: new member joined guild", {
      guildId: guild.id,
      guildName: guild.name,
      memberId: member.id,
      username: member.user?.username,
    });

    const config = await this.findWelcomeConfig(guild.id);
    if (!config) {
      this.logger.debug?.("welcome-manager: no welcome config found for guild", { guildId: guild.id });
      return;
    }

    if (!config.enabled) {
      this.logger.debug?.("welcome-manager: welcome is disabled for guild", { guildId: guild.id });
      return;
    }

    // Skip welcome, auto-role, and direct message if member is a bot and ignoreBots is enabled
    if (config.ignoreBots && member.user?.bot) {
      this.logger.info("welcome-manager: skipping welcome for bot member as ignoreBots is enabled", {
        guildId: guild.id,
        guildName: guild.name,
        memberId: member.id,
        botUsername: member.user.username,
      });
      return;
    }

    // 1. Assign auto-role if configured
    if (config.autoRoleEnabled && config.autoRoleId) {
      try {
        const role = guild.roles.cache.get(config.autoRoleId) ?? (await guild.roles.fetch(config.autoRoleId).catch(() => null));
        if (role) {
          await member.roles.add(role);
          this.logger.info("welcome-manager: assigned auto-role to member", {
            guildId: guild.id,
            memberId: member.id,
            roleId: config.autoRoleId,
            roleName: role.name,
          });
        } else {
          this.logger.warn("welcome-manager: auto-role not found on guild", {
            guildId: guild.id,
            roleId: config.autoRoleId,
          });
        }
      } catch (roleErr) {
        this.logger.warn("welcome-manager: failed to add auto-role", {
          guildId: guild.id,
          memberId: member.id,
          roleId: config.autoRoleId,
          error: roleErr instanceof Error ? roleErr.message : String(roleErr),
        });
      }
    }

    // 2. Locate the welcome channel
    if (!config.channelId) {
      this.logger.warn("welcome-manager: welcome enabled but channelId is missing", { guildId: guild.id });
      return;
    }

    const channel =
      guild.channels.cache.get(config.channelId) ??
      (await guild.channels.fetch(config.channelId).catch(() => null));

    if (!channel || !channel.isTextBased()) {
      this.logger.warn("welcome-manager: target channel not found or not text-based", {
        guildId: guild.id,
        channelId: config.channelId,
      });
      return;
    }

    // 3. Format message with standardized variables
    let messageText =
      config.message ||
      "Welcome to **{server}**, {user}! You are our **#{memberCount}** member. Check out #rules to get started! 🚀";

    messageText = messageText
      .replace(/{user}/g, `<@${member.id}>`)
      .replace(/{user\.name}/g, member.user?.username ?? "Member")
      .replace(/{server}/g, guild.name)
      .replace(/{memberCount}/g, guild.memberCount.toLocaleString())
      .replace(/{channel}/g, `<#${channel.id}>`);

    // 4. Prepare banner attachment (if canvas card is enabled)
    const files: AttachmentBuilder[] = [];
    if (config.customCanvasCard) {
      const cardBuffer = await this.renderWelcomeCard(config, member);
      if (cardBuffer) {
        files.push(new AttachmentBuilder(cardBuffer, { name: "welcome-card.png" }));
      } else if (config.bannerConfig?.bgImageUrl) {
        // Fallback to raw background wallpaper if dynamic rendering failed
        const dataUri = config.bannerConfig.bgImageUrl;
        if (dataUri.startsWith("data:image/")) {
          try {
            const match = dataUri.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
            if (match && match[2]) {
              const ext = match[1] === "jpeg" ? "jpg" : match[1];
              const buffer = Buffer.from(match[2], "base64");
              files.push(new AttachmentBuilder(buffer, { name: `welcome-card.${ext}` }));
            }
          } catch (imgErr) {
            this.logger.warn("welcome-manager: error decoding banner image", { error: imgErr });
          }
        }
      }
    }

    // 5. Send Direct Message (DM) if configured
    if (config.sendDm) {
      try {
        const dmPayload = files.length > 0 ? { content: messageText, files } : { content: messageText };
        await member.send(dmPayload);
        this.logger.info("welcome-manager: sent welcome DM to member", {
          memberId: member.id,
        });
      } catch (dmErr) {
        this.logger.debug?.("welcome-manager: could not send DM (user DMs may be closed)", {
          memberId: member.id,
          error: dmErr,
        });
      }
    }

    // 6. Send Welcome Message to designated channel
    try {
      const payloadText =
        config.pingUser && !messageText.includes(`<@${member.id}>`)
          ? `<@${member.id}> ${messageText}`
          : messageText;

      const channelPayload = files.length > 0 ? { content: payloadText, files } : { content: payloadText };
      await (channel as any).send(channelPayload);

      this.logger.info("welcome-manager: sent welcome message to channel", {
        guildId: guild.id,
        channelId: channel.id,
        channelName: "name" in channel ? (channel as any).name : undefined,
        memberId: member.id,
      });
    } catch (sendErr) {
      this.logger.error("welcome-manager: failed to send message to channel", {
        guildId: guild.id,
        channelId: channel.id,
        error: sendErr instanceof Error ? sendErr.message : String(sendErr),
      });
    }
  }

  private async renderWelcomeCard(config: StoredWelcomeConfig, member: GuildMember): Promise<Buffer | null> {
    try {
      const banner = config.bannerConfig;
      if (!banner) return null;

      const canvas = createCanvas(700, 260);
      const ctx = canvas.getContext("2d");

      // 1. Draw Background
      if (banner.bgImageUrl) {
        let bgBuffer: Buffer | null = null;
        if (banner.bgImageUrl.startsWith("data:image/")) {
          const match = banner.bgImageUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
          if (match && match[2]) {
            bgBuffer = Buffer.from(match[2], "base64");
          }
        } else if (banner.bgImageUrl.startsWith("http")) {
          const res = await fetch(banner.bgImageUrl);
          if (res.ok) {
            const arr = await res.arrayBuffer();
            bgBuffer = Buffer.from(arr);
          }
        }
        if (bgBuffer) {
          const bgImg = await loadImage(bgBuffer);
          ctx.drawImage(bgImg, 0, 0, 700, 260);
        }
      } else {
        const grad = ctx.createLinearGradient(0, 0, 700, 260);
        grad.addColorStop(0, "#0f172a");
        grad.addColorStop(0.5, "#1e1b4b");
        grad.addColorStop(1, "#020617");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 700, 260);
      }

      // Overlay opacity if configured
      if (typeof banner.overlayOpacity === "number" && banner.overlayOpacity > 0) {
        ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(1, banner.overlayOpacity)})`;
        ctx.fillRect(0, 0, 700, 260);
      }

      // Pre-fetch member avatar
      const avatarUrl =
        member.user?.displayAvatarURL({ extension: "png", size: 256 }) ||
        member.user?.defaultAvatarURL;
      let avatarImg: Image | null = null;
      if (avatarUrl) {
        try {
          const res = await fetch(avatarUrl);
          if (res.ok) {
            const arr = await res.arrayBuffer();
            avatarImg = await loadImage(Buffer.from(arr));
          }
        } catch (fetchErr) {
          this.logger.debug?.("welcome-manager: error fetching member avatar", { error: fetchErr });
        }
      }

      const guild = member.guild;
      const username = member.user?.username ?? "Member";

      // 2. Render Layers
      const layers = (banner.layers as Array<Record<string, unknown>>) || [];
      if (layers.length > 0) {
        for (const layer of layers) {
          if (layer.type === "avatar") {
            const cx = 350 + (Number(layer.x) || 0);
            const cy = 130 + (Number(layer.y) || 0);
            const size = Number(layer.size) || 82;
            const r = size / 2;
            const shape = String(layer.shape || "circle");
            const borderWidth = Number(layer.borderWidth) || 0;
            const borderColor = String(layer.borderColor || "#5865F2");

            ctx.save();
            ctx.beginPath();
            if (shape === "squircle") {
              const radius = Math.min(16, size / 4);
              const x = cx - r;
              const y = cy - r;
              if (typeof ctx.roundRect === "function") {
                ctx.roundRect(x, y, size, size, radius);
              } else {
                ctx.rect(x, y, size, size);
              }
            } else {
              ctx.arc(cx, cy, r, 0, Math.PI * 2);
            }
            ctx.closePath();
            ctx.clip();

            if (avatarImg) {
              ctx.drawImage(avatarImg, cx - r, cy - r, size, size);
            } else {
              const aGrad = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
              aGrad.addColorStop(0, "#4f46e5");
              aGrad.addColorStop(1, "#1e1b4b");
              ctx.fillStyle = aGrad;
              ctx.fillRect(cx - r, cy - r, size, size);

              ctx.fillStyle = "#FFFFFF";
              ctx.font = `bold ${Math.round(size * 0.4)}px sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText(username.charAt(0).toUpperCase(), cx, cy);
            }
            ctx.restore();

            if (borderWidth > 0) {
              ctx.save();
              ctx.lineWidth = borderWidth;
              ctx.strokeStyle = borderColor;
              ctx.beginPath();
              if (shape === "squircle") {
                const radius = Math.min(16, size / 4);
                const x = cx - r;
                const y = cy - r;
                if (typeof ctx.roundRect === "function") {
                  ctx.roundRect(x, y, size, size, radius);
                } else {
                  ctx.rect(x, y, size, size);
                }
              } else {
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
              }
              ctx.stroke();
              ctx.restore();
            }
          }

          if (layer.type === "text") {
            const tx = 350 + (Number(layer.x) || 0);
            const ty = 130 + (Number(layer.y) || 0);
            const fontSize = Number(layer.fontSize) || 16;
            const color = String(layer.color || "#FFFFFF");
            const align = (String(layer.align || "center") as "left" | "right" | "center" | "start" | "end");

            let text = String(layer.text ?? "{user.name}")
              .replace(/{user\.name}/g, username)
              .replace(/{user}/g, `@${username}`)
              .replace(/{server}/g, guild?.name ?? "Server")
              .replace(/{memberCount}/g, String(guild?.memberCount ?? 1));

            ctx.save();
            ctx.font = `bold ${fontSize}px sans-serif`;
            ctx.fillStyle = color;
            ctx.textAlign = align;
            ctx.textBaseline = "middle";
            ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
            ctx.shadowBlur = 4;
            ctx.shadowOffsetX = 1;
            ctx.shadowOffsetY = 1;
            ctx.fillText(text, tx, ty);
            ctx.restore();
          }
        }
      }

      return canvas.toBuffer("image/png");
    } catch (renderErr) {
      this.logger.error("welcome-manager: error rendering canvas card", {
        error: renderErr instanceof Error ? renderErr.message : String(renderErr),
      });
      return null;
    }
  }
}
