import { describe, expect, it } from "vitest";
import { renderRankCard } from "./rank-card-renderer.js";

describe("renderRankCard", () => {
  it("renders a valid PNG buffer with default preset", async () => {
    const buffer = await renderRankCard({
      username: "Assistance",
      avatarUrl: null,
      rank: 1,
      level: 10,
      totalXp: 4250,
      progressXp: 835,
      neededXp: 925,
      percentage: 90,
      config: {
        preset: "landscape",
        progressBarColor: "#5865f2",
        circleColor: "#5865f2",
        textColor: "#ffffff",
        barTextColor: "#ffffff",
      },
    });

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1000);
    // PNG file header magic bytes: 0x89 0x50 0x4E 0x47
    expect(buffer[0]).toBe(0x89);
    expect(buffer[1]).toBe(0x50);
    expect(buffer[2]).toBe(0x4e);
    expect(buffer[3]).toBe(0x47);
  });

  it("renders with ocean and blurple presets without errors", async () => {
    const oceanBuffer = await renderRankCard({
      username: "TestOcean",
      avatarUrl: null,
      rank: 2,
      level: 5,
      totalXp: 1200,
      progressXp: 200,
      neededXp: 500,
      percentage: 40,
      config: {
        preset: "ocean",
        progressBarColor: "#10b981",
        circleColor: "#10b981",
        textColor: "#ffffff",
        barTextColor: "#ffffff",
      },
    });
    expect(oceanBuffer.length).toBeGreaterThan(1000);

    const blurpleBuffer = await renderRankCard({
      username: "TestBlurple",
      avatarUrl: null,
      rank: 3,
      level: 2,
      totalXp: 300,
      progressXp: 50,
      neededXp: 100,
      percentage: 50,
      config: {
        preset: "blurple",
        progressBarColor: "#a855f7",
        circleColor: "#a855f7",
        textColor: "#ffffff",
        barTextColor: "#ffffff",
      },
    });
    expect(blurpleBuffer.length).toBeGreaterThan(1000);
  });
});
