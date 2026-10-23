import type { HeroClass } from './Classes';

/**
 * Hit points at the game's scale. The tabletop rules count a few hit points (a level-1 wizard has 8); the
 * game counts five times as many, so every roll that gives or restores hit points is scaled the same way.
 */
export const TABLETOP_HP_SCALE = 5;

/** A level gained adds the class's hit die taken at its average (half the die, plus one) plus CON (at least 1). */
export function hitPointsPerLevel(cls: HeroClass, conModifier: number): number {
  return TABLETOP_HP_SCALE * Math.max(1, cls.hitDie / 2 + 1 + conModifier);
}

/** A hit die spent heals what it rolls plus CON (at least 1). */
export function hitDieHealing(roll: number, conModifier: number): number {
  return TABLETOP_HP_SCALE * Math.max(1, roll + conModifier);
}

/** A long rest gives back half the hero's hit dice (at least one), up to one a level. */
export function hitDiceRegained(level: number): number {
  return Math.max(1, Math.floor(level / 2));
}
