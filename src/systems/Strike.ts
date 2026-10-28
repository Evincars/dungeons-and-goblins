import { isPlayer } from '../world';
import type { Entity } from '../world';
import { resolveAttack } from '../rules/Combat';
import type { AttackOutcome, AttackProfile } from '../rules/Combat';
import { characterSheet } from '../rules/CharacterSheet';
import { MONSTERS } from '../rules/Monsters';
import { UNARMORED_AC } from '../rules/ArmorTable';
import { logAttack } from './RollLogSystem';
import { recordBlow } from './CombatLogSystem';
import { afterBlow, evasiveBonus, prepareBlow } from './ManeuverSystem';
import type { SpellId } from '../rules/Spells';
import { sound } from '../audio/SoundPlayer';

/**
 * Every blow in the game goes through here: the attack is rolled against the target's Armor Class, and the
 * roll shows over the attacker's head. The caller applies the damage when it hits.
 */

/** A target's Armor Class: an enemy's from its monster block, a player's from their sheet (and Evasive Footwork), anything else (the training dummy) 10. */
export function armorClassOf(target: Entity): number {
  if (target.mobType) return MONSTERS[target.mobType].ac;
  if (isPlayer(target)) return characterSheet(target).armorClass.total + evasiveBonus(target);
  return UNARMORED_AC;
}

/**
 * The attack as rolled: whoever won the first strike (systems/InitiativeSystem.ts) uses it up on this one,
 * with advantage (which cancels a disadvantage instead).
 */
function withFirstStrike(attack: AttackProfile, attacker: Entity | undefined): AttackProfile {
  const initiative = attacker?.initiative;
  if (!initiative?.firstStrike) return attack;
  initiative.firstStrike = false;
  return { ...attack, mode: attack.mode === 'disadvantage' ? 'normal' : 'advantage' };
}

/**
 * Rolls `attack` against `target`, showing the result over `logOn` (the attacker, or a projectile's shooter)
 * and writing it into the combat log. A critical hit is heard: blood and the crack of bone. A weapon blow (not a
 * spell) is shaped by the hero's readied maneuver and the marks on both fighters (systems/ManeuverSystem.ts).
 */
export function strike(target: Entity, attack: AttackProfile, logOn: Entity | undefined, spell?: SpellId): AttackOutcome {
  const prepared = spell ? attack : prepareBlow(attack, logOn, target);
  const outcome = resolveAttack(withFirstStrike(prepared, logOn), armorClassOf(target));
  if (!spell) afterBlow(logOn, target, outcome);
  if (outcome.critical && target.position) sound.playSound('critical', target.position.x, target.position.y);
  if (!logOn) return outcome;
  logAttack(logOn, outcome);
  recordBlow(logOn, outcome, spell);
  return outcome;
}
