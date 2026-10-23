import { rollAttack, rollDice, rollDie } from './Dice';
import type { AttackRoll, D20Mode, Dice, DieRoller } from './Dice';

/**
 * One blow under the tabletop rules, at the speed of an action game: d20 + attack bonus against the target's
 * Armor Class; on a hit, the damage dice (twice as many on a natural 20).
 */

/** A blow that lands always hurts a little, even when penalties take the roll below it. */
export const MIN_HIT_DAMAGE = 1;
/** A natural 1 on the d20: the attack misses whatever the bonus (a "critical miss"). */
const NATURAL_FUMBLE = 1;

/** What an attack adds to its d20, how the d20 is rolled, and the damage it deals. */
export type AttackProfile = { attackBonus: number; damage: Dice; mode: D20Mode };

export type AttackOutcome = AttackRoll & {
  attackBonus: number;
  /** The natural 1 that misses whatever the bonus. */
  fumble: boolean;
  /** The dice rolled for damage (doubled on a critical) and what they came to (0 on a miss). */
  damageDice: Dice;
  damage: number;
};

export function resolveAttack(attack: AttackProfile, targetAC: number, die: DieRoller = rollDie): AttackOutcome {
  const roll = rollAttack(attack.attackBonus, targetAC, attack.mode, die);
  const damageDice = roll.critical ? { ...attack.damage, count: attack.damage.count * 2 } : attack.damage;
  const damage = roll.hit ? Math.max(MIN_HIT_DAMAGE, rollDice(attack.damage, roll.critical, die)) : 0;
  return { ...roll, attackBonus: attack.attackBonus, fumble: roll.natural === NATURAL_FUMBLE, damageDice, damage };
}
