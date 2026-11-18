import { rollAttack, rollDice, rollDie } from './Dice';
import type { AttackRoll, D20Mode, Dice, DieRoller, DieSides } from './Dice';

/**
 * One blow under the tabletop rules, at the speed of an action game: d20 + attack bonus against the target's
 * Armor Class; on a hit, the damage dice (twice as many on a natural 20).
 */

/** A blow that lands always hurts a little, even when penalties take the roll below it. */
export const MIN_HIT_DAMAGE = 1;
/** A natural 1 on the d20: the attack misses whatever the bonus (a "critical miss"). */
const NATURAL_FUMBLE = 1;

/**
 * What an attack adds to its d20, how the d20 is rolled, the damage it deals, any extra dice of another size and
 * the damage dice that are rolled again when they show this or less (Great Weapon Fighting), and the lowest d20 that is
 * a critical hit (a natural 20 unless a Champion's critical range is wider).
 */
export type AttackProfile = {
  attackBonus: number; damage: Dice; mode: D20Mode; extra?: Dice; rerollBelow?: number; critFrom?: number;
  /** The lowest a damage die counts for (Elemental Adept's 2; 1 when not given). */
  lowestFace?: number;
  /** A Battle Master's Precision Attack: a die of this size is added to a roll that misses, when that makes it hit. */
  precisionSides?: DieSides;
  /** The damage dice are rolled twice and the higher total kept (the Savage Attacker feat). */
  savage?: boolean;
};

export type AttackOutcome = AttackRoll & {
  attackBonus: number;
  /** The natural 1 that misses whatever the bonus. */
  fumble: boolean;
  /** The dice rolled for damage (doubled on a critical) and what they came to (0 on a miss). */
  damageDice: Dice;
  damage: number;
  /** What a Precision Attack's die added to the roll to turn a miss into a hit (0: not used). */
  precision: number;
};

/** A missed roll (not a natural 1) that a Precision Attack's die lifts to the target's Armor Class: the die, else 0. */
function precisionBonus(attack: AttackProfile, roll: AttackRoll, targetAC: number, die: DieRoller): number {
  if (!attack.precisionSides || roll.hit || roll.natural === NATURAL_FUMBLE) return 0;
  const extra = die(attack.precisionSides);
  return roll.total + extra >= targetAC ? extra : 0;
}

/** The weapon's damage roll: once, or twice keeping the higher for a Savage Attacker. */
function damageRoll(attack: AttackProfile, critical: boolean, die: DieRoller): number {
  const first = rollDice(attack.damage, critical, die, attack.rerollBelow, attack.lowestFace);
  return attack.savage ? Math.max(first, rollDice(attack.damage, critical, die, attack.rerollBelow, attack.lowestFace)) : first;
}

export function resolveAttack(attack: AttackProfile, targetAC: number, die: DieRoller = rollDie): AttackOutcome {
  const rolled = rollAttack(attack.attackBonus, targetAC, attack.mode, die, attack.critFrom);
  const precision = precisionBonus(attack, rolled, targetAC, die);
  const roll = precision > 0 ? { ...rolled, total: rolled.total + precision, hit: true } : rolled;
  const damageDice = roll.critical ? { ...attack.damage, count: attack.damage.count * 2 } : attack.damage;
  const extra = attack.extra && roll.hit ? rollDice(attack.extra, roll.critical, die) : 0;
  const damage = roll.hit ? Math.max(MIN_HIT_DAMAGE, damageRoll(attack, roll.critical, die) + extra) : 0;
  return { ...roll, attackBonus: attack.attackBonus, fumble: roll.natural === NATURAL_FUMBLE, damageDice, damage, precision };
}
