import type { HeroClass } from './Classes';
import type { DieSides } from './Dice';
import { abilityModifier } from './Abilities';
import { FEATS } from './Feats';
import { hasFeat } from './Build';
import type { Build } from './Build';

/**
 * Hit points at the game's scale. The tabletop rules count a few hit points (a level-1 wizard has 8); the
 * game counts five times as many, so every roll that gives or restores hit points is scaled the same way.
 */
export const TABLETOP_HP_SCALE = 5;

/** A new hero's hit points: ten hit dice's worth of the class's die plus CON for each of them, at the game's scale. */
export function startingHitPoints(hitDie: DieSides, constitution: number): number {
  return TABLETOP_HP_SCALE * (2 * hitDie + abilityModifier(constitution));
}

/** The Tough feat's hit points for the level just gained: each level, and all the levels so far on the one it is taken. */
function featHitPoints(cls: HeroClass, level: number, build: Build | undefined): number {
  if (!hasFeat(cls, level, build, 'tough')) return 0;
  const before = level > 1 && hasFeat(cls, level - 1, build, 'tough');
  return FEATS.tough.hitPointsPerLevel * (before ? 1 : level);
}

/** A level gained adds the class's hit die taken at its average (half the die, plus one) plus CON (at least 1), and Tough's share. */
export function hitPointsPerLevel(cls: HeroClass, conModifier: number, level: number, build?: Build): number {
  return TABLETOP_HP_SCALE * (Math.max(1, cls.hitDie / 2 + 1 + conModifier) + featHitPoints(cls, level, build));
}

/** A hit die spent heals what it rolls plus CON (at least 1). */
export function hitDieHealing(roll: number, conModifier: number): number {
  return TABLETOP_HP_SCALE * Math.max(1, roll + conModifier);
}

/** A long rest gives back half the hero's hit dice (at least one), up to one a level. */
export function hitDiceRegained(level: number): number {
  return Math.max(1, Math.floor(level / 2));
}
