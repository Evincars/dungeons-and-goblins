import { isPlayer } from '../world';
import type { Entity } from '../world';
import { resolveAttack } from '../rules/Combat';
import type { AttackOutcome, AttackProfile } from '../rules/Combat';
import { characterSheet } from '../rules/CharacterSheet';
import { MONSTERS } from '../rules/Monsters';
import { UNARMORED_AC } from '../rules/ArmorTable';
import { logAttack } from './RollLogSystem';
import { recordBlow } from './CombatLogSystem';

/**
 * Every blow in the game goes through here: the attack is rolled against the target's Armor Class, and the
 * roll shows over the attacker's head. The caller applies the damage when it hits.
 */

/** A target's Armor Class: an enemy's from its monster block, a player's from their sheet, anything else (the training dummy) 10. */
export function armorClassOf(target: Entity): number {
  if (target.mobType) return MONSTERS[target.mobType].ac;
  if (isPlayer(target)) return characterSheet(target).armorClass.total;
  return UNARMORED_AC;
}

/**
 * Rolls `attack` against `target`, showing the result over `logOn` (the attacker, or a projectile's shooter)
 * and writing it into the combat log.
 */
export function strike(target: Entity, attack: AttackProfile, logOn: Entity | undefined): AttackOutcome {
  const outcome = resolveAttack(attack, armorClassOf(target));
  if (!logOn) return outcome;
  logAttack(logOn, outcome);
  recordBlow(logOn, outcome);
  return outcome;
}
