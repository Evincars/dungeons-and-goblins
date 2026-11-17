import { q, isActivePlayer, world } from '../world';
import type { Player, StatName } from '../world';
import type { Level } from '../level/Level';
import { rollDice, dice, rollD20, rollDie } from '../rules/Dice';
import type { DieRoller } from '../rules/Dice';
import { characterSheet } from '../rules/CharacterSheet';
import { featureOn, featureOfClass } from '../rules/ClassFeatures';
import { readyManeuver } from './ManeuverSystem';
import { isManeuver } from '../rules/Maneuvers';
import { playAura, playEffect } from '../assets/Effects';
import type { Aura } from '../assets/Effects';
import { AIM_HEIGHT } from '../entities/ProjectileFactory';
import { overHole } from './HoleSystem';
import { logHeal } from './RollLogSystem';
import { recordEvent } from './CombatLogSystem';
import { heroClass } from '../rules/Classes';

/**
 * The active class features (rules/ClassFeatures.ts), used from the quick bar with the cast key. Each does its work
 * at once; the spell system spends the square's recovery. Only the features marked `worked` in src/data/features.json
 * come here. The passive Survivor is kept up here too.
 */

/** Second Wind heals 1d10 + the fighter's level. */
const SECOND_WIND_SIDES = 10;
/** Second Wind wraps the fighter in a turquoise glow for a moment (just over half a second). */
const SECOND_WIND_AURA: Aura = { shape: 'halo_ring', tint: 0x40e0d0, ticks: 36, lift: AIM_HEIGHT, scale: 0.9 };
/** Ticks (60 to the second) a feature's boost lasts: Action Surge's doubled attacks, Remarkable Athlete's doubled speed (6 s). */
export const FEATURE_BOOST_TICKS = 360;
/** Ticks Indomitable needs before it rerolls another saving throw (30 s; a rest makes it ready at once). */
export const INDOMITABLE_COOLDOWN_TICKS = 1800;
/** Preserve Life shares a pool of this many hit points per cleric level among the allies near, none above half their health. */
const PRESERVE_LIFE_PER_LEVEL = 5;
/** ...among allies this near (30 feet at 48 px to 5 feet, in pixels). */
const PRESERVE_LIFE_REACH = 288;
/** Heals show this effect. */
const HEAL_EFFECT = { shape: 'sparkle_ring', colour: 'green', scale: 1 } as const;
/** Arcane Charge teleports up to 30 feet, in steps this long (px). */
const ARCANE_CHARGE_REACH = 288;
const ARCANE_CHARGE_STEP = 12;
const ARCANE_CHARGE_EFFECT = { shape: 'sparkle_ring', colour: 'azure', scale: 1 } as const;
/** Survivor mends the hero at the start of each of their turns: every 6 seconds. */
const SURVIVOR_TICKS = 360;
/** Survivor adds this much to the hero's Constitution modifier, in tabletop hit points. */
const SURVIVOR_BASE = 5;

/** What using a feature came to: done, or why it was not. */
export type FeatureResult = 'ok' | 'unworked' | 'no_dice' | 'no_ally' | 'hp_full';

/** What a hero's feature is called (its id if the class does not list it). */
function nameOfFeature(hero: Player, id: string): string {
  return featureOfClass(heroClass(hero.heroClass).dndClass, id)?.name ?? id;
}

/** Mends `target` by `amount` hit points (at most to `cap`) with the healing effect and the number over their head; `source` names where it came from. */
function mend(target: Player, amount: number, cap: number, source: string): number {
  const h = target.health;
  const healed = Math.max(0, Math.min(cap - h.current, amount));
  if (healed <= 0) return 0;
  h.current += healed;
  playEffect(HEAL_EFFECT.shape, HEAL_EFFECT.colour, target.position.x, target.position.y, AIM_HEIGHT, HEAL_EFFECT.scale);
  logHeal(target, healed);
  recordEvent(target, 'regain', { amount: healed, item: source });
  return healed;
}

/** Second Wind: the turquoise glow, and 1d10 + the fighter's level back. */
function secondWind(hero: Player): void {
  const id = world.id(hero);
  if (id !== undefined) playAura(SECOND_WIND_AURA, id, hero.position.x, hero.position.y);
  mend(hero, rollDice(dice(1, SECOND_WIND_SIDES)) + hero.playerStats.level, hero.health.max, nameOfFeature(hero, 'second_wind'));
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
  let pool = PRESERVE_LIFE_PER_LEVEL * hero.playerStats.level;
  for (const ally of q.players) {
    if (pool <= 0) return;
    if (!isActivePlayer(ally)) continue;
    if (Math.hypot(ally.position.x - hero.position.x, ally.position.y - hero.position.y) > PRESERVE_LIFE_REACH) continue;
    pool -= mend(ally, pool, Math.floor(ally.health.max / 2), nameOfFeature(hero, 'channel_divinity'));
  }
}

/** A place a body can stand: not inside a wall at its feet, and not over a pit. */
function standable(level: Level, hero: Player, x: number, y: number): boolean {
  const rx = hero.radius?.x ?? 0;
  if (level.blocksPoint(x, y) || level.blocksPoint(x - rx, y) || level.blocksPoint(x + rx, y)) return false;
  return !overHole(level, { position: { x, y }, radius: hero.radius });
}

/**
 * Arcane Charge: with Action Surge the hero steps through the air up to 30 feet toward where they aim, as far as the
 * way stays open (walls stop them short).
 */
function arcaneCharge(hero: Player, level: Level): void {
  const aim = hero.aimVector ?? { x: 0, y: 1 };
  const from = { x: hero.position.x, y: hero.position.y };
  let reached = 0;
  for (let d = ARCANE_CHARGE_STEP; d <= ARCANE_CHARGE_REACH; d += ARCANE_CHARGE_STEP) {
    if (level.blocksPoint(from.x + aim.x * d, from.y + aim.y * d)) break;
    if (standable(level, hero, from.x + aim.x * d, from.y + aim.y * d)) reached = d;
  }
  if (reached === 0) return;
  playEffect(ARCANE_CHARGE_EFFECT.shape, ARCANE_CHARGE_EFFECT.colour, from.x, from.y, AIM_HEIGHT, ARCANE_CHARGE_EFFECT.scale);
  hero.position.x = from.x + aim.x * reached;
  hero.position.y = from.y + aim.y * reached;
  playEffect(ARCANE_CHARGE_EFFECT.shape, ARCANE_CHARGE_EFFECT.colour, hero.position.x, hero.position.y, AIM_HEIGHT, ARCANE_CHARGE_EFFECT.scale);
}

/**
 * The hero uses a feature: its effect happens now. Returns why nothing happened for one the game does not play out
 * yet or a maneuver that can't be readied (nothing is spent then). `slot` is the quick-bar square it was used from.
 */
export function usedFeature(hero: Player, id: string, slot: number, level: Level): FeatureResult {
  const used = (): void => recordEvent(hero, 'feature', { item: nameOfFeature(hero, id) });
  if (id === 'second_wind') {
    // Nothing to mend at full health: it is not used, and its square does not start recovering.
    if (hero.health.current >= hero.health.max) return 'hp_full';
    used();
    secondWind(hero);
  } else if (id === 'action_surge') {
    used();
    hero.actionSurge = FEATURE_BOOST_TICKS;
    if (featureOn(hero, 'arcane_charge')) arcaneCharge(hero, level);
  } else if (id === 'remarkable_athlete') {
    used();
    hero.athleteBoost = FEATURE_BOOST_TICKS;
  } else if (id === 'arcane_recovery' || id === 'eldritch_master') {
    used();
    readyTheBar(hero, slot);
  } else if (id === 'cunning_action') {
    used();
    cunningAction(hero);
  } else if (id === 'channel_divinity') {
    used();
    preserveLife(hero);
  } else if (isManeuver(id)) {
    const result = readyManeuver(hero, id);
    return result === 'unknown' ? 'unworked' : result;
  } else {
    return 'unworked';
  }
  return 'ok';
}

/** Each hero's feature boosts (Action Surge, Remarkable Athlete) and Indomitable's recovery run down a tick. */
export function updateFeatureTimers(): void {
  for (const hero of q.players) {
    if ((hero.actionSurge ?? 0) > 0) hero.actionSurge = (hero.actionSurge ?? 0) - 1;
    if ((hero.athleteBoost ?? 0) > 0) hero.athleteBoost = (hero.athleteBoost ?? 0) - 1;
    if ((hero.indomitableCooldown ?? 0) > 0) hero.indomitableCooldown = (hero.indomitableCooldown ?? 0) - 1;
  }
}

/** Remarkable Athlete doubles the hero's speed while it lasts. */
const ATHLETE_SPEED_FACTOR = 2;
export function athleteSpeedFactor(hero: Pick<Player, 'athleteBoost'>): number {
  return (hero.athleteBoost ?? 0) > 0 ? ATHLETE_SPEED_FACTOR : 1;
}

/**
 * A hero's saving throw (d20 + their save bonus against `dc`). Indomitable, a passive: a failed save is rolled again and
 * the new roll stands, then it needs 30 seconds (or a rest) before it does so again. Nothing in the dungeon asks a hero
 * for a saving throw yet; whatever comes to will roll it here.
 */
export function heroSavingThrow(hero: Player, stat: StatName, dc: number, die: DieRoller = rollDie): boolean {
  const bonus = characterSheet(hero).saves[stat].bonus;
  if (rollD20('normal', die) + bonus >= dc) return true;
  if ((hero.indomitableCooldown ?? 0) > 0 || !featureOn(hero, 'indomitable')) return false;
  hero.indomitableCooldown = INDOMITABLE_COOLDOWN_TICKS;
  recordEvent(hero, 'feature', { item: nameOfFeature(hero, 'indomitable') });
  return rollD20('normal', die) + bonus >= dc;
}

/**
 * A Champion's Survivor: every 6 seconds a hero at half their hit points or fewer (but not down) mends 5 + their
 * Constitution modifier.
 */
export function updateSurvivor(): void {
  for (const hero of q.players) {
    if ((hero.survivorCooldown ?? 0) > 0) {
      hero.survivorCooldown = (hero.survivorCooldown ?? 0) - 1;
      continue;
    }
    const h = hero.health;
    if (h.current <= 0 || h.current * 2 > h.max || !isActivePlayer(hero) || !featureOn(hero, 'survivor')) continue;
    const amount = Math.max(1, SURVIVOR_BASE + characterSheet(hero).modifiers.constitution);
    mend(hero, amount, h.max, nameOfFeature(hero, 'survivor'));
    hero.survivorCooldown = SURVIVOR_TICKS;
  }
}
