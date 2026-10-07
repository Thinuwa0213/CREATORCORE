import { describe, expect, it } from "vitest";
import {
  getLevelFromXp,
  getXpForLevel,
  getLevelProgress,
  generateProgressBar,
} from "./level-calculator.js";

describe("level-calculator", () => {
  it("computes level accurately according to 100 * Level^2 formula", () => {
    expect(getLevelFromXp(0)).toBe(0);
    expect(getLevelFromXp(99)).toBe(0);
    expect(getLevelFromXp(100)).toBe(1);
    expect(getLevelFromXp(399)).toBe(1);
    expect(getLevelFromXp(400)).toBe(2);
    expect(getLevelFromXp(900)).toBe(3);
    expect(getLevelFromXp(1600)).toBe(4);
    expect(getLevelFromXp(2300)).toBe(4);
    expect(getLevelFromXp(2500)).toBe(5);
  });

  it("calculates cumulative threshold XP for level milestones", () => {
    expect(getXpForLevel(0)).toBe(0);
    expect(getXpForLevel(1)).toBe(100);
    expect(getXpForLevel(2)).toBe(400);
    expect(getXpForLevel(3)).toBe(900);
    expect(getXpForLevel(4)).toBe(1600);
    expect(getXpForLevel(5)).toBe(2500);
    expect(getXpForLevel(10)).toBe(10000);
  });

  it("calculates level progress within level boundary correctly (e.g. 2300 XP in Level 4)", () => {
    const progress = getLevelProgress(2300);
    expect(progress.level).toBe(4);
    expect(progress.currentLevelBaseXp).toBe(1600);
    expect(progress.nextLevelBaseXp).toBe(2500);
    expect(progress.progressXp).toBe(700);
    expect(progress.neededXp).toBe(900);
    expect(progress.percentage).toBe(77);
  });

  it("renders text progress bars with filled and empty block characters", () => {
    const bar80 = generateProgressBar(80, 10);
    expect(bar80).toContain("80%");
    expect(bar80).toContain("█");
    expect(bar80).toContain("░");
  });
});
