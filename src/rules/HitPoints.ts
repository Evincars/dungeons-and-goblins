import type { HeroClass } from './Classes';
import type { DieSides } from './Dice';
import { abilityModifier } from './Abilities';
import { FEATS } from './Feats';
import { hasFeat } from './Build';
import type { Build } from './Build';

/**
 * Hit points as the tabletop rules (SRD 5e) count them: a hero starts with their class's whole hit die plus CON, gains
 * the die's average plus CON a level, and a hit die spent in a short rest heals its roll plus CON.
 */

/** No roll that gives or restores hit points gives less than this (a low roll and a CON penalty still help a little). */
const MIN_HIT_POINTS = 1;

/** A new hero's hit points: the class's hit die at its highest, plus CON. */
export function startingHitPoints(hitDie: DieSides, constitution: number): number {
  return Math.max(MIN_HIT_POINTS, hitDie + abilityModifier(constitution));
}

/** The Tough feat's hit points for the level just gained: each level, and all the levels so far on the one it is taken. */
function featHitPoints(cls: HeroClass, level: number, build: Build | undefined): number {
  if (!hasFeat(cls, level, build, 'tough')) return 0;
  const before = level > 1 && hasFeat(cls, level - 1, build, 'tough');
  return FEATS.tough.hitPointsPerLevel * (before ? 1 : level);
}

/** A level gained adds the class's hit die taken at its average (half the die, plus one) plus CON (at least 1), and Tough's share. */
export function hitPointsPerLevel(cls: HeroClass, conModifier: number, level: number, build?: Build): number {
  return Math.max(MIN_HIT_POINTS, cls.hitDie / 2 + 1 + conModifier) + featHitPoints(cls, level, build);
}

/** A hit die spent heals what it rolls plus CON (at least 1). */
export function hitDieHealing(roll: number, conModifier: number): number {
  return Math.max(MIN_HIT_POINTS, roll + conModifier);
}

/** A long rest gives back half the hero's hit dice (at least one), up to one a level. */
export function hitDiceRegained(level: number): number {
  return Math.max(1, Math.floor(level / 2));
}
