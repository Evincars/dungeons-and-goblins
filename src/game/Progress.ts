/** Experience needed to rise from a level to the next. */
export function xpForLevel(level: number): number {
  return level * 100;
}

/** All the experience a player has earned, counting what went into the levels they have already gained. */
export function totalXp(stats: { level: number; exp: number }): number {
  let total = stats.exp;
  for (let l = 1; l < stats.level; l++) total += xpForLevel(l);
  return total;
}
