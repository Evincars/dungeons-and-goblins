import { q, isActivePlayer } from '../world';
import type { Player } from '../world';
import { rollDice, dice } from '../rules/Dice';
import { TABLETOP_HP_SCALE } from '../rules/HitPoints';
import { playEffect } from '../assets/Effects';
import { AIM_HEIGHT } from '../entities/ProjectileFactory';
import { logHeal } from './RollLogSystem';

/**
 * The active class features (rules/ClassFeatures.ts), used from the quick bar with the cast key. Each does its work
 * at once; the spell system spends the square's recovery. Only the features marked `worked` in src/data/features.json
 * come here.
 */

/** Second Wind heals 1d10 + the fighter's level. */
const SECOND_WIND_SIDES = 10;
/** Preserve Life shares a pool of this many hit points per cleric level among the allies near, none above half their health. */
const PRESERVE_LIFE_PER_LEVEL = 5;
/** ...among allies this near (30 feet at 48 px to 5 feet, in pixels). */
const PRESERVE_LIFE_REACH = 288;
/** Heals show this effect. */
const HEAL_EFFECT = { shape: 'sparkle_ring', colour: 'green', scale: 1 } as const;

/** Mends `target` by `amount` hit points (at most to `cap`) with the healing effect and the number over their head. */
function mend(target: Player, amount: number, cap: number): number {
  const h = target.health;
  const healed = Math.max(0, Math.min(cap - h.current, amount));
  if (healed <= 0) return 0;
  h.current += healed;
  playEffect(HEAL_EFFECT.shape, HEAL_EFFECT.colour, target.position.x, target.position.y, AIM_HEIGHT, HEAL_EFFECT.scale);
  logHeal(target, healed);
  return healed;
}

function secondWind(hero: Player): void {
  mend(hero, TABLETOP_HP_SCALE * (rollDice(dice(1, SECOND_WIND_SIDES)) + hero.playerStats.level), hero.health.max);
}

/** Every other square's recovery runs out at once (Action Surge: more to do in the same moment; the two recoveries: the spells). */
function readyTheBar(hero: Player, spare: number): void {
  const recovery = hero.spellbook?.recovery;
  if (!recovery) return;
  for (let i = 0; i < recovery.length; i++) if (i !== spare) recovery[i] = 0;
}

/** Cunning Action: a Dash as a bonus action, so the sprint stamina is full again. */
function cunningAction(hero: Player): void {
  hero.playerStats.sprint = 0;
  hero.playerStats.sprintLocked = false;
}

/** Preserve Life: the pool is shared out among the allies near (the hero included), each taking what they need up to half their health. */
function preserveLife(hero: Player): void {
  let pool = PRESERVE_LIFE_PER_LEVEL * hero.playerStats.level * TABLETOP_HP_SCALE;
  for (const ally of q.players) {
    if (pool <= 0) return;
    if (!isActivePlayer(ally)) continue;
    if (Math.hypot(ally.position.x - hero.position.x, ally.position.y - hero.position.y) > PRESERVE_LIFE_REACH) continue;
    pool -= mend(ally, pool, Math.floor(ally.health.max / 2));
  }
}

/**
 * The hero uses a feature: its effect happens now. Returns false for one the game does not play out yet (nothing
 * happens and nothing is spent). `slot` is the quick-bar square it was used from.
 */
export function usedFeature(hero: Player, id: string, slot: number): boolean {
  if (id === 'second_wind') secondWind(hero);
  else if (id === 'action_surge' || id === 'arcane_recovery' || id === 'eldritch_master') readyTheBar(hero, slot);
  else if (id === 'cunning_action') cunningAction(hero);
  else if (id === 'channel_divinity') preserveLife(hero);
  else return false;
  return true;
}
