import { world } from '../world';
import type { Entity, Player } from '../world';
import { text } from '../core/texts';
import { characterSheet } from '../rules/CharacterSheet';
import { superioritySides } from '../rules/Maneuvers';
import { diceLeft, spendDie } from './ManeuverSystem';
import { logLine } from './RollLogSystem';
import { recordEvent } from './CombatLogSystem';
import { strike } from './Strike';
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
