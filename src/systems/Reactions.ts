import { world } from '../world';
import type { Entity, Player } from '../world';
import { text } from '../core/texts';
import { characterSheet } from '../rules/CharacterSheet';
import { superioritySides } from '../rules/Maneuvers';
import { diceLeft, spendDie } from './ManeuverSystem';
import { logLine } from './RollLogSystem';
import { recordEvent } from './CombatLogSystem';
import { armorClassOf, strike } from './Strike';
import type { AttackOutcome } from '../rules/Combat';
import { NATURAL_CRIT } from '../rules/Dice';
import { DUELIST_COOLDOWN_TICKS } from '../rules/Feats';
import { featName } from '../rules/Names';
import { hitMob } from './Hits';

/**
 * The Battle Master's reactions to an enemy's melee blow, which a readied Parry or Riposte waits for
 * (systems/ManeuverSystem.ts): Parry takes a superiority die + DEX off a blow that hurts, Riposte answers a blow that
 * missed with a weapon attack of the hero's own.
 */

/** Whether the hero has this reaction readied and a die to spend on it. */
function readied(hero: Player, id: string): boolean {
  const maneuver = hero.maneuver;
  return maneuver?.id === id && maneuver.ticks > 0 && diceLeft(hero) > 0;
}

/** An enemy's melee blow is about to hurt the hero: a readied Parry lowers the damage (to nothing, at most). */
export function parried(hero: Player, damage: number): number {
  if (!readied(hero, 'parry')) return damage;
  const reduction = spendDie(hero) + characterSheet(hero).modifiers.dexterity;
  world.removeComponent(hero, 'maneuver');
  logLine(hero, text('roll.parry', { amount: Math.max(0, reduction) }), 'hit');
  recordEvent(hero, 'parry', { amount: Math.min(damage, Math.max(0, reduction)) });
  return Math.max(0, damage - Math.max(0, reduction));
}

/** An enemy's melee blow missed the hero: a readied Riposte strikes back at it at once, a superiority die more on a hit. */
export function riposted(hero: Player, foe: Entity): void {
  if (!readied(hero, 'riposte')) return;
  const sides = superioritySides(hero.playerStats.level);
  spendDie(hero);
  world.removeComponent(hero, 'maneuver');
  logLine(hero, text('roll.riposte'), 'crit');
  recordEvent(hero, 'riposte');
  const attack = characterSheet(hero).attack;
  const outcome = strike(foe, attack.extra ? attack : { ...attack, extra: { count: 1, sides, bonus: 0 } }, hero);
  if (outcome.hit) hitMob(foe, hero, outcome.damage);
}

/**
 * Defensive Duellist, a Passive Feat that works by itself: an enemy's melee blow that hits (not a natural 20) while the hero
 * holds a finesse weapon they are proficient with, and that their proficiency bonus added to their Armor Class would turn
 * aside, misses. It then needs 30 seconds (or a rest) before it does so again. Returns whether the blow was turned.
 */
export function duelistTurnsAside(hero: Player, outcome: AttackOutcome): boolean {
  if (!outcome.hit || outcome.natural === NATURAL_CRIT || (hero.duelistCooldown ?? 0) > 0) return false;
  const sheet = characterSheet(hero);
  const attack = sheet.attack;
  if (!sheet.feats.duelist || !attack.item || !attack.proficient || !attack.rule.properties.includes('finesse')) return false;
  if (outcome.total >= armorClassOf(hero) + sheet.proficiency) return false;
  hero.duelistCooldown = DUELIST_COOLDOWN_TICKS;
  logLine(hero, text('roll.duelist', { bonus: sheet.proficiency }), 'hit');
  recordEvent(hero, 'feature', { item: featName('defensive_duelist') });
  return true;
}
