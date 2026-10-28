import { MathUtils } from 'yuka';

/**
 * Dice as the tabletop game writes them: `2d6 + 3` is two six-sided dice plus three. Every roll in the rules
 * (attacks, damage, checks, saves) goes through here, so a test can pass its own die and get fixed results.
 */

/** The polyhedral set: d4, d6, d8, d10, d12, d20 (and d100, the percentile pair). */
export const DIE_SIDES = [4, 6, 8, 10, 12, 20, 100] as const;
export type DieSides = (typeof DIE_SIDES)[number];

export function isDieSides(value: unknown): value is DieSides {
  return DIE_SIDES.some((sides) => sides === value);
}

/** `count` dice of `sides` sides, plus a flat `bonus` (negative for a penalty). */
export type Dice = { count: number; sides: DieSides; bonus: number };

/** Rolls one die: a whole number from 1 to `sides`. */
export type DieRoller = (sides: DieSides) => number;

const fairDie: DieRoller = (sides) => MathUtils.randInt(1, sides);
let loaded: DieRoller | null = null;

/** One fair die roll, unless the dice are loaded (useDieRoller). */
export const rollDie: DieRoller = (sides) => (loaded ?? fairDie)(sides);

/** Tests can load the dice: every roll comes from `roller` until it is set back to null. */
export function useDieRoller(roller: DieRoller | null): void {
  loaded = roller;
}

export function dice(count: number, sides: DieSides, bonus = 0): Dice {
  return { count, sides, bonus };
}

/** The same dice with `amount` more added on (an ability modifier, a magic bonus). */
export function plus(roll: Dice, amount: number): Dice {
  return { ...roll, bonus: roll.bonus + amount };
}

/** `+3`, `-1` or `+0`: how the rules write a modifier. */
export function formatModifier(amount: number): string {
  return amount < 0 ? `-${-amount}` : `+${amount}`;
}

/** `1d8 + 2`, `2d6`, `1d4 - 1` (`compact`: `1d8+2`); no dice at all is just the number (a punch's `1`). */
export function formatDice(roll: Dice, compact = false): string {
  if (roll.count === 0) return String(roll.bonus);
  const base = `${roll.count}d${roll.sides}`;
  if (roll.bonus === 0) return base;
  const space = compact ? '' : ' ';
  return `${base}${space}${roll.bonus < 0 ? '-' : '+'}${space}${Math.abs(roll.bonus)}`;
}

const NOTATION = /^\s*(\d{1,2})\s*d\s*(\d{1,3})\s*(?:([+-])\s*(\d{1,3}))?\s*$/i;

/** A damage roll with extra dice of another size: `1d4+1d6+3` (`compact`) or `1d4 + 1d6 + 3`. */
export function formatDamage(roll: Dice, extra: Dice | undefined, compact = false): string {
  if (!extra) return formatDice(roll, compact);
  const space = compact ? '' : ' ';
  const head = `${roll.count}d${roll.sides}${space}+${space}${extra.count}d${extra.sides}`;
  if (roll.bonus === 0) return head;
  return `${head}${space}${roll.bonus < 0 ? '-' : '+'}${space}${Math.abs(roll.bonus)}`;
}

/** Reads `2d6+3` / `1d20 - 1` (as written in data files); null when it is not dice notation. */
export function parseDice(notation: string): Dice | null {
  const match = NOTATION.exec(notation);
  if (!match) return null;
  const sides = Number(match[2]);
  if (!isDieSides(sides)) return null;
  const bonus = match[4] ? Number(match[4]) * (match[3] === '-' ? -1 : 1) : 0;
  return dice(Number(match[1]), sides, bonus);
}

/** The lowest, highest and average totals of a roll. */
export function diceRange(roll: Dice): { min: number; max: number; average: number } {
  return {
    min: roll.count + roll.bonus,
    max: roll.count * roll.sides + roll.bonus,
    average: (roll.count * (roll.sides + 1)) / 2 + roll.bonus,
  };
}

/**
 * Rolls the dice and adds the bonus. A critical hit rolls the dice twice over (the bonus is added once),
 * as the rules have it. A die that shows `rerollBelow` or less is rolled again and the new roll stands (Great
 * Weapon Fighting).
 */
export function rollDice(roll: Dice, critical = false, die: DieRoller = rollDie, rerollBelow = 0): number {
  const count = critical ? roll.count * 2 : roll.count;
  let total = roll.bonus;
  for (let i = 0; i < count; i++) {
    const first = die(roll.sides);
    total += first <= rerollBelow ? die(roll.sides) : first;
  }
  return total;
}

/** Advantage rolls two d20s and keeps the higher, disadvantage the lower; having both cancels out. */
export type D20Mode = 'normal' | 'advantage' | 'disadvantage';

/** One d20, rolled the way `mode` says. */
export function rollD20(mode: D20Mode = 'normal', die: DieRoller = rollDie): number {
  const first = die(20);
  if (mode === 'normal') return first;
  const second = die(20);
  return mode === 'advantage' ? Math.max(first, second) : Math.min(first, second);
}

/** A natural 20 on an attack always hits, and critically; a natural 1 always misses. */
export const NATURAL_CRIT = 20;
const NATURAL_FUMBLE = 1;

export type AttackRoll = { natural: number; total: number; hit: boolean; critical: boolean };

/**
 * An attack: d20 + `attackBonus` against the target's Armor Class (meeting it is enough). A d20 of `critFrom` or more
 * is a critical hit that always lands (a Champion's weapon attacks are critical from a 19, then an 18).
 */
export function rollAttack(attackBonus: number, targetAC: number, mode: D20Mode = 'normal', die: DieRoller = rollDie, critFrom = NATURAL_CRIT): AttackRoll {
  const natural = rollD20(mode, die);
  const total = natural + attackBonus;
  const critical = natural >= critFrom;
  const hit = critical || (natural !== NATURAL_FUMBLE && total >= targetAC);
  return { natural, total, hit, critical };
}

/** An ability check or saving throw: d20 + `modifier` against a Difficulty Class (meeting it succeeds). */
export function rollCheck(modifier: number, difficulty: number, mode: D20Mode = 'normal', die: DieRoller = rollDie): { natural: number; total: number; success: boolean } {
  const natural = rollD20(mode, die);
  const total = natural + modifier;
  return { natural, total, success: total >= difficulty };
}
