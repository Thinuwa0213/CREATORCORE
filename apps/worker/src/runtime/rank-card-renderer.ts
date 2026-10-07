import { createCanvas, loadImage, type SKRSContext2D } from "@napi-rs/canvas";
import type { StoredRankCardConfig } from "./xp-manager.js";

export interface RankCardRenderOptions {
  username: string;
  avatarUrl?: string | null | undefined;
  rank: number;
  level: number;
  totalXp: number;
  progressXp: number;
  neededXp: number;
  percentage: number;
  config?: StoredRankCardConfig | undefined;
}

/**
 * Draws a rounded rectangle path on the canvas context.
 */
function roundRect(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.arcTo(x + width, y, x + width, y + radius, radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
  ctx.lineTo(x + radius, y + height);
  ctx.arcTo(x, y + height, x, y + height - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

/**
 * Renders the chosen preset background onto the canvas.
 */
function drawPresetBackground(
  ctx: SKRSContext2D,
  preset: string,
  width: number,
  height: number,
): void {
  if (preset === "ocean") {
    // Ocean preset: Deep midnight sea with soft moon and horizon mist
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, "#050e1d");
    grad.addColorStop(0.5, "#0b1d3a");
    grad.addColorStop(1, "#030812");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Glowing moon
    const moonGrad = ctx.createRadialGradient(640, 50, 0, 640, 50, 70);
    moonGrad.addColorStop(0, "rgba(230, 245, 255, 0.4)");
    moonGrad.addColorStop(0.3, "rgba(180, 220, 255, 0.15)");
    moonGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = moonGrad;
    ctx.fillRect(570, 0, 140, 120);

    ctx.fillStyle = "rgba(240, 248, 255, 0.9)";
    ctx.beginPath();
    ctx.arc(640, 50, 18, 0, Math.PI * 2);
    ctx.fill();

    // Ocean water horizon line
    ctx.fillStyle = "rgba(56, 189, 248, 0.08)";
    ctx.fillRect(0, 190, width, 2);
  } else if (preset === "midnight") {
    // Midnight preset: Dark carbon obsidian minimalism
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, "#0a0c10");
    grad.addColorStop(0.5, "#151821");
    grad.addColorStop(1, "#08090d");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Subtle ambient lighting
    const light = ctx.createRadialGradient(400, 130, 0, 400, 130, 350);
    light.addColorStop(0, "rgba(255, 255, 255, 0.03)");
    light.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, width, height);
  } else if (preset === "blurple") {
    // Blurple preset: Vibrant Discord indigo and violet tones
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, "#131326");
    grad.addColorStop(0.5, "#252254");
    grad.addColorStop(1, "#363273");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Blurple ambient glow
    const glow = ctx.createRadialGradient(width - 100, 50, 0, width - 100, 50, 200);
    glow.addColorStop(0, "rgba(88, 101, 242, 0.25)");
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
  } else {
    // Landscape preset (Default): Cosmic starry night with soft mountain silhouettes
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, "#071524");
    grad.addColorStop(0.5, "#0e263d");
    grad.addColorStop(1, "#05101a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Nebula glow
    const nebula = ctx.createRadialGradient(320, 90, 0, 320, 90, 220);
    nebula.addColorStop(0, "rgba(56, 189, 248, 0.15)");
    nebula.addColorStop(0.6, "rgba(99, 102, 241, 0.08)");
    nebula.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = nebula;
    ctx.fillRect(0, 0, width, height);

    // Star field (Fixed deterministic coordinates to avoid frame jitter)
    const stars: Array<[number, number, number, number]> = [
      [45, 30, 1.2, 0.8], [90, 60, 0.8, 0.5], [160, 25, 1.5, 0.9],
      [220, 70, 0.9, 0.6], [310, 35, 1.3, 0.85], [390, 80, 0.7, 0.4],
      [440, 20, 1.4, 0.9], [510, 55, 1.0, 0.7], [590, 30, 1.2, 0.8],
      [680, 75, 0.9, 0.5], [740, 25, 1.5, 0.9], [780, 60, 1.1, 0.7],
      [120, 95, 0.8, 0.4], [470, 90, 0.7, 0.5], [630, 95, 1.0, 0.6],
    ];

    for (const [sx, sy, sr, so] of stars) {
      ctx.fillStyle = `rgba(255, 255, 255, ${so})`;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }

    // Mountain hill silhouette at bottom
    ctx.fillStyle = "#030a11";
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(0, 210);
    ctx.quadraticCurveTo(240, 175, 480, 215);
    ctx.quadraticCurveTo(640, 195, width, 220);
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();

    // Foreground hill layer
    ctx.fillStyle = "#02060a";
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(0, 230);
    ctx.quadraticCurveTo(350, 205, width, 235);
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * Renders a high-resolution, custom Discord Rank Card PNG buffer.
 */
export async function renderRankCard(options: RankCardRenderOptions): Promise<Buffer> {
  const width = 800;
  const height = 260;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const config = options.config ?? {};
  const preset = config.preset || "landscape";
  const progressBarColor = config.progressBarColor || "#5865f2";
  const circleColor = config.circleColor || "#5865f2";
  const textColor = config.textColor || "#ffffff";
  const barTextColor = config.barTextColor || "#ffffff";

  // 1. Clip outer card to rounded rectangle (radius: 18px)
  roundRect(ctx, 0, 0, width, height, 18);
  ctx.clip();

  // 2. Draw Background (Custom URL or Preset)
  let backgroundRendered = false;
  if (config.customBgUrl && config.customBgUrl.startsWith("http")) {
    try {
      const res = await fetch(config.customBgUrl);
      if (res.ok) {
        const arr = await res.arrayBuffer();
        const img = await loadImage(Buffer.from(arr));
        ctx.drawImage(img, 0, 0, width, height);
        backgroundRendered = true;
      }
    } catch {
      // Fallback to preset
    }
  }

  if (!backgroundRendered) {
    drawPresetBackground(ctx, preset, width, height);
  }

  // 3. Draw User Avatar with Glowing Circle Ring
  const avatarCenterX = 95;
  const avatarCenterY = 130;
  const avatarRadius = 52;

  // Outer glowing ring
  ctx.save();
  ctx.shadowColor = circleColor;
  ctx.shadowBlur = 14;
  ctx.strokeStyle = circleColor;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(avatarCenterX, avatarCenterY, avatarRadius + 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Draw Avatar image
  let avatarLoaded = false;
  if (options.avatarUrl) {
    try {
      const res = await fetch(options.avatarUrl);
      if (res.ok) {
        const arr = await res.arrayBuffer();
        const avatarImg = await loadImage(Buffer.from(arr));

        ctx.save();
        ctx.beginPath();
        ctx.arc(avatarCenterX, avatarCenterY, avatarRadius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(
          avatarImg,
          avatarCenterX - avatarRadius,
          avatarCenterY - avatarRadius,
          avatarRadius * 2,
          avatarRadius * 2,
        );
        ctx.restore();
        avatarLoaded = true;
      }
    } catch {
      // Fallback to placeholder avatar
    }
  }

  if (!avatarLoaded) {
    ctx.save();
    ctx.fillStyle = circleColor;
    ctx.beginPath();
    ctx.arc(avatarCenterX, avatarCenterY, avatarRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 36px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      (options.username[0] || "?").toUpperCase(),
      avatarCenterX,
      avatarCenterY,
    );
    ctx.restore();
  }

  // 4. User Display Name
  ctx.fillStyle = textColor;
  ctx.font = "bold 26px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  let displayName = options.username;
  if (displayName.length > 20) {
    displayName = `${displayName.substring(0, 19)}...`;
  }
  ctx.fillText(displayName, 180, 32);

  // 5. Top-Right Badges: RANK and LVL
  // Rank badge
  ctx.textAlign = "right";
  ctx.font = "bold 12px sans-serif";
  ctx.fillStyle = textColor;
  ctx.globalAlpha = 0.65;
  ctx.fillText("RANK", 660, 28);
  ctx.globalAlpha = 1.0;

  ctx.font = "bold 26px sans-serif";
  ctx.fillStyle = textColor;
  ctx.fillText(`#${options.rank}`, 660, 42);

  // Level badge
  ctx.font = "bold 12px sans-serif";
  ctx.globalAlpha = 0.65;
  ctx.fillText("LVL", 755, 28);
  ctx.globalAlpha = 1.0;

  ctx.font = "bold 26px sans-serif";
  ctx.fillStyle = textColor;
  ctx.fillText(`${options.level}`, 755, 42);

  // 6. Stats Grid (Translucent Glassmorphism Card)
  const statsBoxX = 180;
  const statsBoxY = 78;
  const statsBoxWidth = 575;
  const statsBoxHeight = 64;

  ctx.save();
  roundRect(ctx, statsBoxX, statsBoxY, statsBoxWidth, statsBoxHeight, 10);
  ctx.fillStyle = "rgba(0, 0, 0, 0.42)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  // Columns inside the stats box
  const statColumns = [
    { label: "TOTAL XP", value: options.totalXp.toLocaleString() },
    { label: "PROGRESS", value: `${options.progressXp.toLocaleString()} XP` },
    { label: "TARGET", value: `${options.neededXp.toLocaleString()} XP` },
    { label: "SERVER RANK", value: `#${options.rank}` },
  ];

  const colWidth = statsBoxWidth / statColumns.length;
  statColumns.forEach((col, idx) => {
    const colX = statsBoxX + idx * colWidth + colWidth / 2;

    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    // Label
    ctx.font = "bold 10px sans-serif";
    ctx.fillStyle = textColor;
    ctx.globalAlpha = 0.55;
    ctx.fillText(col.label, colX, statsBoxY + 12);
    ctx.globalAlpha = 1.0;

    // Value
    ctx.font = "bold 16px sans-serif";
    ctx.fillStyle = textColor;
    ctx.fillText(col.value, colX, statsBoxY + 30);
  });

  // 7. Progress Bar Text (Above Bar)
  const barY = 192;
  const barHeight = 24;
  const barWidth = 575;

  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.font = "bold 13px sans-serif";
  ctx.fillStyle = textColor;
  ctx.fillText(
    `${options.progressXp.toLocaleString()} / ${options.neededXp.toLocaleString()} XP`,
    statsBoxX,
    barY - 6,
  );

  ctx.textAlign = "right";
  ctx.fillText(`${options.percentage}%`, statsBoxX + barWidth, barY - 6);

  // 8. Progress Bar Pill (Track & Fill)
  // Track
  ctx.save();
  roundRect(ctx, statsBoxX, barY, barWidth, barHeight, 12);
  ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
  ctx.fill();
  ctx.restore();

  // Fill
  const fillWidth = Math.max(
    barHeight,
    Math.min(barWidth, (options.percentage / 100) * barWidth),
  );

  ctx.save();
  roundRect(ctx, statsBoxX, barY, fillWidth, barHeight, 12);

  const barGrad = ctx.createLinearGradient(statsBoxX, barY, statsBoxX + fillWidth, barY);
  barGrad.addColorStop(0, progressBarColor);
  barGrad.addColorStop(1, progressBarColor);
  ctx.fillStyle = barGrad;
  ctx.fill();

  // Text inside progress bar (only if width allows)
  if (fillWidth > 70) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 11px sans-serif";
    ctx.fillStyle = barTextColor;
    ctx.fillText(`${options.percentage}%`, statsBoxX + fillWidth / 2, barY + barHeight / 2);
  }
  ctx.restore();

  return canvas.toBuffer("image/png");
}
