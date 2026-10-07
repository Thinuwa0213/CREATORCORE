/**
 * Level & XP calculation formulas based on:
 * Total Required XP = 100 × Level²
 */

export interface LevelProgress {
  level: number;
  totalXp: number;
  currentLevelBaseXp: number;
  nextLevelBaseXp: number;
  progressXp: number;
  neededXp: number;
  percentage: number;
}

/**
 * Calculates the level corresponding to a given amount of total XP.
 * Level = floor(sqrt(totalXp / 100))
 */
export function getLevelFromXp(totalXp: number): number {
  if (totalXp <= 0) return 0;
  return Math.floor(Math.sqrt(totalXp / 100));
}

/**
 * Calculates the total cumulative XP required to achieve a specific level.
 * XP = 100 × Level²
 */
export function getXpForLevel(level: number): number {
  if (level <= 0) return 0;
  return 100 * level * level;
}

/**
 * Calculates the detailed progress within the current level towards the next level.
 */
export function getLevelProgress(totalXp: number): LevelProgress {
  const safeXp = Math.max(0, Math.floor(totalXp));
  const level = getLevelFromXp(safeXp);
  const currentLevelBaseXp = getXpForLevel(level);
  const nextLevelBaseXp = getXpForLevel(level + 1);

  const neededXp = nextLevelBaseXp - currentLevelBaseXp;
  const progressXp = safeXp - currentLevelBaseXp;
  const percentage = neededXp > 0 ? Math.min(100, Math.floor((progressXp / neededXp) * 100)) : 0;

  return {
    level,
    totalXp: safeXp,
    currentLevelBaseXp,
    nextLevelBaseXp,
    progressXp,
    neededXp,
    percentage,
  };
}

/**
 * Generates an ASCII visual progress bar for Discord embeds / UI.
 * e.g. [████████░░] 80%
 */
export function generateProgressBar(percentage: number, length = 10): string {
  const safePercent = Math.max(0, Math.min(100, percentage));
  const filledCount = Math.round((safePercent / 100) * length);
  const emptyCount = Math.max(0, length - filledCount);
  return `[${"█".repeat(filledCount)}${"░".repeat(emptyCount)}] ${safePercent}%`;
}
