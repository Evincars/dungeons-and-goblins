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
import { bleeds, spawnBlood } from '../entities/Blood';
import { withinCloseQuarters } from '../rules/CloseQuarters';
import { playVfx } from '../render/VfxPlayer';
import { inDimLight, inFog } from '../ai/perception/obscured';
import { holdsShadowBlade } from '../rules/SpellWeapons';
import { isOtherworldly } from '../rules/Conditions';
import { isAsleep } from './SleepSpell';
import { heldIn } from './SpellHolds';
import { seesInvisible } from './Invisibility';
import { imageTakes } from './Illusions';

/**
 * Every blow in the game goes through here: the attack is rolled against the target's Armor Class, and the
 * roll shows over the attacker's head. The caller applies the damage when it hits.
 */

/**
 * A target's Armor Class: an enemy's from its monster block, a player's from their sheet (and Evasive Footwork), a raised
 * undead's its own, anything else (the training dummy) 10.
 */
export function armorClassOf(target: Entity): number {
  if (target.mobType) return MONSTERS[target.mobType].ac;
  if (target.summon) return target.summon.ac;
  if (target.decoy) return target.decoy.ac;
  if (isPlayer(target)) return characterSheet(target).armorClass.total + evasiveBonus(target);
  return UNARMORED_AC;
}

/** True Strike (systems/LastingSpells.ts): the hero's next attack roll has advantage, and uses it up. */
function withTrueStrike(attack: AttackProfile, attacker: Entity | undefined): AttackProfile {
  const buffs = attacker?.buffs;
  if (!buffs || (buffs.trueStrike ?? 0) <= 0) return attack;
  buffs.trueStrike = 0;
  if (attacker?.position) playVfx('true-strike', attacker.position.x, attacker.position.y, TRUE_STRIKE_LIFT);
  return { ...attack, mode: better(attack.mode) };
}

/** True Strike's flash as it is spent shows at the attacker's eyes, this far above their feet. */
const TRUE_STRIKE_LIFT = 26;

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
 * A hero who slipped and lies prone (systems/Surfaces.ts): their own attacks are at disadvantage; blows at them from within
 * 5 feet at advantage, shots from further off at disadvantage. (A foe's prone is its marks', systems/ManeuverSystem.ts.)
 */
function withHeroDown(attack: AttackProfile, attacker: Entity | undefined, target: Entity): AttackProfile {
  let mode = attack.mode;
  if ((attacker?.knockedDown ?? 0) > 0) mode = worse(mode);
  if ((target.knockedDown ?? 0) > 0 && attacker?.position && target.position) {
    const close = withinCloseQuarters(attacker.position.x, attacker.position.y, target.position.x, target.position.y);
    mode = close ? better(mode) : worse(mode);
  }
  return mode === attack.mode ? attack : { ...attack, mode };
}

/**
 * Fog (Fog Cloud, ai/perception/obscured.ts): an attacker in it cannot see out, a target in it cannot be seen — either way the
 * attack is at disadvantage.
 */
function withObscured(attack: AttackProfile, attacker: Entity | undefined, target: Entity): AttackProfile {
  const hidden = (target.position && inFog(target.position.x, target.position.y)) || (attacker?.position && inFog(attacker.position.x, attacker.position.y));
  return hidden ? { ...attack, mode: worse(attack.mode) } : attack;
}

/** Protection from Evil and Good (systems/AllySpells.ts): an undead (or fiend, fey…) attacks the warded at disadvantage. */
function withWard(attack: AttackProfile, attacker: Entity | undefined, target: Entity): AttackProfile {
  if ((target.buffs?.protection ?? 0) <= 0 || !attacker?.mobType) return attack;
  return isOtherworldly(MONSTERS[attacker.mobType].creature) ? { ...attack, mode: worse(attack.mode) } : attack;
}

/**
 * A target asleep (Sleep, systems/SleepSpell.ts) is unconscious: attacks against it have advantage, and a hit from within 5
 * feet is a critical hit.
 */
function withSleeper(attack: AttackProfile, attacker: Entity | undefined, target: Entity): AttackProfile {
  if (!isAsleep(target)) return attack;
  const close = !!attacker?.position && !!target.position
    && withinCloseQuarters(attacker.position.x, attacker.position.y, target.position.x, target.position.y);
  return { ...attack, mode: better(attack.mode), ...(close ? { critOnHit: true } : {}) };
}

/** Whether the two stand within 5 feet of each other. */
function close(attacker: Entity | undefined, target: Entity): boolean {
  return !!attacker?.position && !!target.position
    && withinCloseQuarters(attacker.position.x, attacker.position.y, target.position.x, target.position.y);
}

/**
 * What spells hold either in (systems/SpellHolds.ts): attacks against the paralysed have advantage and a hit from within 5
 * feet is a critical hit; one laughing lies prone (advantage from within 5 feet, disadvantage from further); the restrained
 * and the blinded are struck at advantage and strike at disadvantage.
 */
function withHolds(attack: AttackProfile, attacker: Entity | undefined, target: Entity): AttackProfile {
  let mode = attack.mode;
  const near = close(attacker, target);
  if (heldIn(target, 'paralyzed') || heldIn(target, 'restrained') || heldIn(target, 'blinded')) mode = better(mode);
  if (heldIn(target, 'laughing')) mode = near ? better(mode) : worse(mode);
  if (heldIn(attacker, 'restrained') || heldIn(attacker, 'blinded')) mode = worse(mode);
  const crit = heldIn(target, 'paralyzed') && near;
  if (mode === attack.mode && !crit) return attack;
  return { ...attack, mode, ...(crit ? { critOnHit: true } : {}) };
}

/**
 * Who sees whom (systems/Invisibility.ts): an attacker unseen strikes at advantage, a target unseen is struck at disadvantage
 * (unless the other sees the invisible); a blurred target (Blur) is struck at disadvantage.
 */
function withSight(attack: AttackProfile, attacker: Entity | undefined, target: Entity): AttackProfile {
  let mode = attack.mode;
  if (target.invisible && !seesInvisible(attacker)) mode = worse(mode);
  if (attacker?.invisible && !seesInvisible(target)) mode = better(mode);
  if ((target.buffs?.blur ?? 0) > 0) mode = worse(mode);
  return mode === attack.mode ? attack : { ...attack, mode };
}

/** Shadow Blade (rules/SpellWeapons.ts): a weapon blow with it at a target in dim light or darkness has advantage. */
function withShadowBlade(attack: AttackProfile, attacker: Entity | undefined, target: Entity): AttackProfile {
  if (!holdsShadowBlade(attacker?.buffs) || !target.position || !inDimLight(target.position.x, target.position.y)) return attack;
  return { ...attack, mode: better(attack.mode) };
}

/** Everything about where the two stand and what holds them that shapes the roll. */
function withCircumstances(attack: AttackProfile, attacker: Entity | undefined, target: Entity): AttackProfile {
  const placed = withSleeper(withWard(withObscured(withHeroDown(attack, attacker, target), attacker, target), attacker, target), attacker, target);
  return withSight(withHolds(placed, attacker, target), attacker, target);
}

/** One step towards disadvantage, or towards advantage (each cancels the other). */
const worse = (mode: AttackProfile['mode']): AttackProfile['mode'] => (mode === 'advantage' ? 'normal' : 'disadvantage');
const better = (mode: AttackProfile['mode']): AttackProfile['mode'] => (mode === 'disadvantage' ? 'normal' : 'advantage');

/**
 * Rolls `attack` against `target`, showing the result over `logOn` (the attacker, or a projectile's shooter)
 * and writing it into the combat log. A blow that hurts a hero or a foe draws blood (entities/Blood.ts); a critical hit
 * is heard: blood and the crack of bone. A weapon blow (not a
 * spell) is shaped by the hero's readied maneuver and the marks on both fighters (systems/ManeuverSystem.ts).
 */
export function strike(target: Entity, attack: AttackProfile, logOn: Entity | undefined, spell?: SpellId): AttackOutcome {
  // Mirror Image: the blow may go for one of the target's duplicates instead (systems/Illusions.ts).
  const image = imageTakes(target, attack, logOn);
  if (image) return image;
  const prepared = spell ? attack : withShadowBlade(prepareBlow(attack, logOn, target), logOn, target);
  const outcome = resolveAttack(withTrueStrike(withFirstStrike(withCircumstances(prepared, logOn, target), logOn), logOn), armorClassOf(target));
  if (!spell) afterBlow(logOn, target, outcome);
  if (outcome.critical && target.position) sound.playSound('critical', target.position.x, target.position.y);
  if (outcome.damage > 0 && bleeds(target)) spawnBlood(target);
  if (!logOn) return outcome;
  if (logOn.playerStats && outcome.critical) logOn.playerStats.critHits++;
  if (logOn.playerStats && outcome.fumble) logOn.playerStats.critMisses++;
  logAttack(logOn, outcome);
  recordBlow(logOn, outcome, spell);
  return outcome;
}
