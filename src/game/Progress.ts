/**
 * Experience and levels as the tabletop rules have them: experience points add up over the whole run (the
 * SRD monster blocks say what each kill is worth), and a level is reached at a fixed total.
 */

/** Total experience at which each level begins (SRD): level 2 at 300, level 3 at 900, … level 20 at 355,000. */
export const LEVEL_THRESHOLDS = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
  85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000,
] as const;

export const MAX_LEVEL = LEVEL_THRESHOLDS.length;

/** The level a total of experience points reaches. */
export function levelForXp(xp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && xp >= LEVEL_THRESHOLDS[level]) level++;
  return level;
}

/** The total experience the next level begins at (null at the top level). */
export function nextLevelXp(level: number): number | null {
  return level < MAX_LEVEL ? LEVEL_THRESHOLDS[level] : null;
}

/** All the experience a player has earned (their running total). */
export function totalXp(stats: { exp: number }): number {
  return stats.exp;
}
