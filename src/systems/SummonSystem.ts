import { world, q, isActivePlayer, isMob, isPlayer } from '../world';
import type { Entity, Player, Summon, SummonKind } from '../world';
import type { Level } from '../level/Level';
import { featureOn } from '../rules/ClassFeatures';
import { proficiencyBonus } from '../rules/Abilities';
import { createUndead } from '../entities/SummonFactory';
import { MAX_MOB_RADIUS } from '../entities/MobFactory';
import { AIM_HEIGHT } from '../entities/ProjectileFactory';
import { ATTACK_PERIOD } from '../entities/WeaponStats';
import { stateDuration } from '../characters/Characters';
import { ATTACK_RECOVERY } from '../characters/StateTriggers';
import { nearby, Sense } from '../ai/perception/spatial';
import { clearLine, mobRoute } from '../ai/perception/navigation';
import { playAura, playEffect } from '../assets/Effects';
import type { Aura } from '../assets/Effects';
import { sound } from '../audio/SoundPlayer';
import { strike } from './Strike';
import { hitMob } from './Hits';

/**
 * Animate Dead's undead (entities/SummonFactory.ts): each follows the necromancer who raised it, goes for the nearest foe it
 * can see near them and strikes it in melee (its own to-hit and damage, the necromancer's proficiency bonus added). Foes that
 * touch one strike back (systems/CombatSystem.ts). Raising more lets the ones raised before crumble, and they crumble too
 * when their master falls or leaves.
 */

/** The undead a cast raises stand this far to either side of the necromancer. */
const RAISE_OFFSET = 32;
/** Undead Thralls raises one more. */
const THRALLS_EXTRA = 1;
/** A necromancer may keep one undead standing for every this many wizard levels. */
const LEVELS_PER_UNDEAD = 3;
/** An undead goes for foes this near it (30 feet)… */
const SIGHT = 288;
/** …and never further than this from its master (60 feet); beyond that it comes back. */
const LEASH = 576;
/** Further than this from its master (lost behind a wall or a door) it steps back to their side. */
const LOST = 960;
/** It keeps this close to its master while there is nobody to fight. */
const HEEL = 64;
/** It strikes a foe whose body is this close to its own. */
const REACH = 4;
/** Its route to where it is going is planned again this often (ticks). */
const REPATH_TICKS = 30;
/** A waypoint of its route counts as reached this close (px). */
const WAYPOINT_REACHED = 10;
/** Its green aura is played again this often, so it never fades. */
const AURA_TICKS = 120;
const UNDEAD_AURA: Aura = { shape: 'halo_ring', tint: 0x7fd35a, ticks: AURA_TICKS, lift: AIM_HEIGHT / 2, scale: 0.75 };
const RAISE_EFFECT = { shape: 'swirl_bloom', colour: 'green', scale: 1 } as const;
/** An undead struck shows hurt this long (ticks). */
const UNDEAD_HURT_TICKS = 25;

/** Each undead's route (host only: planning, never sent), and when it is next planned. */
type Route = { tiles: number[]; step: number; repathIn: number; goal: number };
const routes = new WeakMap<Entity, Route>();
const scratch: Entity[] = [];
let auraClock = 0;

/** The hero who raised this undead, if they are still standing. */
function masterOf(undead: Summon): Player | undefined {
  const owner = world.entity(undead.summon.owner);
  return isPlayer(owner) && isActivePlayer(owner) ? owner : undefined;
}

/** An undead falls to dust where it stands. */
function crumble(undead: Entity): void {
  if (undead.position) playEffect(RAISE_EFFECT.shape, RAISE_EFFECT.colour, undead.position.x, undead.position.y, AIM_HEIGHT, RAISE_EFFECT.scale);
  if (undead.health) undead.health.current = 0;
  world.addComponent(undead, 'removed', true);
}

/**
 * The oldest undead the hero raised that still stands crumbles (a new one takes its place). Oldest by entity id, which
 * only grows: the query's own order changes as components come and go.
 */
function crumbleOldest(owner: number): void {
  let oldest: Summon | undefined;
  let oldestId = Infinity;
  for (const undead of q.summons) {
    const id = world.id(undead) ?? Infinity;
    if (undead.summon.owner !== owner || undead.removed || undead.health.current <= 0 || id >= oldestId) continue;
    oldest = undead;
    oldestId = id;
  }
  if (oldest) crumble(oldest);
}

/** A necromancer keeps one undead for every three wizard levels (2 at level 6, 4 at level 12), never none. */
export function undeadCap(hero: Player): number {
  return Math.max(1, Math.floor(hero.playerStats.level / LEVELS_PER_UNDEAD));
}

/**
 * Animate Dead: a new undead of this kind rises at the necromancer's side (two with Undead Thralls); with as many standing
 * as they may keep, the oldest crumbles for each. Undead Thralls also gives each the wizard level in hit points and the
 * necromancer's proficiency bonus on its damage. Returns how many rose.
 */
export function raiseUndead(hero: Player, kind: SummonKind, canStand: (x: number, y: number) => boolean): number {
  const owner = world.id(hero);
  if (owner === undefined) return 0;
  const thralls = featureOn(hero, 'undead_thralls');
  const count = 1 + (thralls ? THRALLS_EXTRA : 0);
  const extraHealth = thralls ? hero.playerStats.level : 0;
  const bonus = thralls ? proficiencyBonus(hero.playerStats.level) : 0;
  for (let i = 0; i < count; i++) {
    if (undeadOf(hero) >= undeadCap(hero)) crumbleOldest(owner);
    const side = i % 2 === 0 ? -1 : 1;
    const x = hero.position.x + side * RAISE_OFFSET;
    const spot = canStand(x, hero.position.y) ? { x, y: hero.position.y } : hero.position;
    createUndead(kind, spot.x, spot.y, owner, extraHealth, bonus);
    playEffect(RAISE_EFFECT.shape, RAISE_EFFECT.colour, spot.x, spot.y, AIM_HEIGHT, RAISE_EFFECT.scale);
  }
  return count;
}

/** How many undead the hero has raised that still stand. */
export function undeadOf(hero: Player): number {
  const owner = world.id(hero);
  let count = 0;
  for (const undead of q.summons) if (undead.summon.owner === owner && undead.health.current > 0) count++;
  return count;
}

const distance = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);

/** The live foe nearest the undead within its sight that is not too far from its master. */
function quarry(undead: Summon, master: Player): Entity | undefined {
  let found: Entity | undefined;
  let best = Infinity;
  for (const foe of nearby(undead.position.x, undead.position.y, SIGHT + MAX_MOB_RADIUS, Sense.mob, scratch)) {
    if (!isMob(foe) || !foe.mobType || foe.health.current <= 0 || distance(foe.position, master.position) > LEASH) continue;
    const d = distance(foe.position, undead.position);
    if (d >= best) continue;
    best = d;
    found = foe;
  }
  return found;
}

/** Faces and pushes the undead along (dx, dy) at its pace. */
function push(undead: Summon, dx: number, dy: number): void {
  const len = Math.hypot(dx, dy);
  if (len === 0) return;
  const speed = undead.speed ?? 0;
  undead.velocity.x += (dx / len) * speed;
  undead.velocity.y += (dy / len) * speed;
  undead.aimVector ??= { x: 0, y: 1 };
  undead.aimVector.x = dx / len;
  undead.aimVector.y = dy / len;
}

/** The undead's planned way to a point it cannot walk straight to (planned again now and then, or for a new goal). */
function routeTo(level: Level, undead: Summon, x: number, y: number): Route {
  const goal = level.tileIndexAt(x, y);
  let route = routes.get(undead);
  if (!route) routes.set(undead, (route = { tiles: [], step: 0, repathIn: 0, goal: -1 }));
  route.repathIn--;
  if (route.goal === goal && route.repathIn > 0) return route;
  route.tiles = mobRoute(level, level.tileIndexAt(undead.position.x, undead.position.y), goal);
  route.step = 0;
  route.goal = goal;
  route.repathIn = REPATH_TICKS;
  return route;
}

/** Whether the undead stands at a tile's middle (a waypoint of its route). */
function reached(level: Level, undead: Summon, tile: number): boolean {
  return Math.hypot(level.tileCentreX(tile) - undead.position.x, level.tileCentreY(tile) - undead.position.y) < WAYPOINT_REACHED;
}

/** Walks a tick toward a point: straight there when the way is clear, else along its route. */
function walkTo(level: Level, undead: Summon, x: number, y: number): void {
  if (clearLine(level, undead.position.x, undead.position.y, x, y)) {
    push(undead, x - undead.position.x, y - undead.position.y);
    return;
  }
  const route = routeTo(level, undead, x, y);
  while (route.step < route.tiles.length && reached(level, undead, route.tiles[route.step])) route.step++;
  if (route.step >= route.tiles.length) return;
  const next = route.tiles[route.step];
  push(undead, level.tileCentreX(next) - undead.position.x, level.tileCentreY(next) - undead.position.y);
}

/** Whether the foe's body is within the undead's reach. */
function inReach(undead: Summon, foe: Entity): boolean {
  if (!foe.position) return false;
  return distance(undead.position, foe.position) <= undead.radius.x + (foe.radius?.x ?? 0) + REACH;
}

/** The undead strikes the foe (once an attack period): its own to-hit against the foe's Armor Class, then its damage. */
function swing(undead: Summon, foe: Entity): void {
  const s = undead.summon;
  if (s.cooldown > 0) return;
  s.cooldown = ATTACK_PERIOD;
  if (undead.character) undead.attackTime = stateDuration(undead.character.def, 'attack') + ATTACK_RECOVERY;
  if (foe.position) push(undead, foe.position.x - undead.position.x, foe.position.y - undead.position.y);
  const outcome = strike(foe, { attackBonus: s.attackBonus, damage: s.damage, mode: 'normal' }, undead);
  if (outcome.hit) hitMob(foe, undead, outcome.damage);
}

/** One undead's tick: fight the nearest foe, else keep to its master's heel; crumble without a master. */
function act(level: Level, undead: Summon): void {
  const master = masterOf(undead);
  if (!master) {
    crumble(undead);
    return;
  }
  const s = undead.summon;
  if (s.cooldown > 0) s.cooldown--;
  if ((undead.attackTime ?? 0) > 0) undead.attackTime = (undead.attackTime ?? 0) - 1;
  if (distance(undead.position, master.position) > LOST) {
    undead.position.x = master.position.x;
    undead.position.y = master.position.y;
    return;
  }
  const foe = quarry(undead, master);
  if (foe && inReach(undead, foe)) swing(undead, foe);
  else if (foe?.position) walkTo(level, undead, foe.position.x, foe.position.y);
  else if (distance(undead.position, master.position) > HEEL) walkTo(level, undead, master.position.x, master.position.y);
}

/** Every standing undead acts, and every now and then its green aura is played afresh. */
export function updateSummons(level: Level): void {
  auraClock = (auraClock + 1) % AURA_TICKS;
  for (const undead of q.summons) {
    if (undead.removed || undead.health.current <= 0) continue;
    act(level, undead);
    const id = world.id(undead);
    if (auraClock === 0 && id !== undefined && !undead.removed) playAura(UNDEAD_AURA, id, undead.position.x, undead.position.y);
  }
}

/** A foe's blow landed on an undead: it loses the hit points, flinches and makes a sound. */
export function hurtUndead(undead: Entity, damage: number): void {
  const h = undead.health;
  if (!h || h.current <= 0) return;
  h.current = Math.max(0, h.current - damage);
  undead.hurtTime = UNDEAD_HURT_TICKS;
  if (undead.position) sound.playSound('hurt', undead.position.x, undead.position.y);
}
