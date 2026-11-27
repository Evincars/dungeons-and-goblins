import { world, q, isActivePlayer, isMob, isPlayer, PUDDLE_ART_RADIUS, PUDDLE_FRAMES } from '../world';
import type { Entity, Player, SurfaceKind } from '../world';
import { text } from '../core/texts';
import { immuneTo } from '../rules/Monsters';
import { statusOf } from './ManeuverSystem';
import { rollDice } from '../rules/Dice';
import type { Dice } from '../rules/Dice';
import type { DamageType } from '../rules/DamageTypes';
import { TICKS_PER_SECOND } from '../rules/Spells';
import { nearby, Sense } from '../ai/perception/spatial';
import { MAX_MOB_RADIUS } from '../entities/MobFactory';
import { AIM_HEIGHT } from '../entities/ProjectileFactory';
import { playEffect } from '../assets/Effects';
import { playVfx } from '../render/VfxPlayer';
import { sound } from '../audio/SoundPlayer';
import { bodySave } from './BodySaves';
import { hurtPlayer } from './CombatSystem';
import { hitMob } from './Hits';
import { logLine } from './RollLogSystem';
import { heldIn, holdBody, rooted } from './SpellHolds';

/**
 * Grease and fire on the floor (the Grease spell, the flasks enemies throw, systems/ThrowSystem.ts), and what they do to
 * whoever stands in them:
 * - grease is difficult terrain — every body in it moves at half its pace — and slick: a body caught in it when it appears,
 *   or stepping into it, makes a Dexterity save or falls prone (`knockDown`): it neither moves nor acts until it is up, and
 *   blows against it have advantage. Fire takes it: grease touched by fire becomes a fire;
 * - fire burns: every round (6 s) whoever stands in it takes 1d4 fire, and a body stepping in saves or catches fire;
 * - a body on fire (`burning`) takes 1d4 fire a round until it burns out; standing in water puts it out;
 * - webs (the Web spell) fill a square: difficult terrain, and a body caught in them when they appear, or stepping in, makes a
 *   Dexterity save or is restrained there (systems/SpellHolds.ts) until a Strength check breaks it free. Fire burns them away
 *   in a round, 2d4 fire to everyone in them.
 * Water puddles and their lightning stay in systems/LastingSpells.ts. The host's work alone.
 */

/** A round of the tabletop game (6 seconds): fire burns once a round. */
const TURN_TICKS = 6 * TICKS_PER_SECOND;
/** Difficult terrain: a body in grease moves at this share of its pace. */
const GREASE_PACE = 0.5;
/** A body that slipped stays down this long (ticks): long enough to see, short enough not to lose the fight. */
export const SLIP_TICKS = 90;
/** The grease's save when it names none (the Grease spell's caster's DC is given). */
const DEFAULT_GREASE_DC = 12;
/** A fire lit from grease burns this long (ticks); fire and burning deal this each round. */
const KINDLED_TICKS = 18 * TICKS_PER_SECOND;
const FIRE_DAMAGE: Dice = { count: 1, sides: 4, bonus: 0 };
/** A body that catches fire burns this long (ticks). */
export const BURN_TICKS = 18 * TICKS_PER_SECOND;
/** A fire on the floor lights the dark round it (px beyond its own reach). */
const FIRE_LIGHT = 12;
const FIRE_FLICKER = 0.7;
/** Grease bursts into flame with this flash. */
const IGNITE_EFFECT = { shape: 'flame_lick', colour: 'coral', scale: 1.4 } as const;
/** The library's flame burst is made for a patch this wide (px of its radius): it is scaled to the grease. */
const IGNITE_ART_RADIUS = 32;
/** Webs set alight burn away in a round, dealing this to everyone in them. */
const WEB_FIRE_DAMAGE: Dice = { count: 2, sides: 4, bonus: 0 };

type Surface = (typeof q.surfaces)['entities'][number];

const scratch: Entity[] = [];
/** Which grease or fire each body last stood in, and on which tick: a body found in one it was not in a tick ago steps in. */
const footing = new WeakMap<Entity, { surface: number; tick: number }>();
let tickCount = 0;

// ── Making them ───────────────────────────────────────────────────────────────

/**
 * Grease or fire on the floor at (x, y), `radius` wide, lasting `ticks` (0: for good). Grease asks a save of everyone it
 * appears under at once; fire set on grease takes it instead of lying beside it.
 */
export function spreadSurface(kind: Extract<SurfaceKind, 'grease' | 'fire' | 'web'>, x: number, y: number, radius: number, owner: number, ticks: number, dc = DEFAULT_GREASE_DC): Entity {
  if (kind === 'fire') igniteGrease(x, y, radius, owner);
  const surface = world.add({
    position: { x, y }, flat: true,
    surface: { kind, radius, owner, pulse: TURN_TICKS, ...(ticks > 0 ? { ticks } : {}), dc },
    visual: { sheet: 'puddle', col: PUDDLE_FRAMES[kind], scale: radius / PUDDLE_ART_RADIUS },
    ...(kind === 'fire' ? { glow: { radius: radius + FIRE_LIGHT, flicker: FIRE_FLICKER } } : {}),
  });
  if (kind === 'fire' || !isSurface(surface)) return surface;
  // Grease or webs spilt into fire go up at once.
  if (fireNear(x, y, radius)) {
    kindle(surface, owner);
    return surface;
  }
  forEachBodyIn(surface, (body) => (kind === 'web' ? caughtOrNot(body, surface) : slipOrNot(body, surface)));
  return surface;
}

const isSurface = (e: Entity): e is Surface => !!e.surface && !!e.position;

/** Whether a patch burns when fire touches it: grease and webs. */
const flammable = (surface: Surface): boolean => surface.surface.kind === 'grease' || surface.surface.kind === 'web';

/** Fire reached grease or webs (a fire spell, alchemist's fire, burning floor): every patch of them it touches bursts into flame. */
export function igniteGrease(x: number, y: number, radius: number, by: number): void {
  for (const grease of q.surfaces) {
    if (!flammable(grease) || grease.removed) continue;
    if (Math.hypot(grease.position.x - x, grease.position.y - y) > radius + grease.surface.radius) continue;
    kindle(grease, by);
  }
}

/** Whether a fire burns on the floor within reach of a patch at (x, y), `radius` wide. */
function fireNear(x: number, y: number, radius: number): boolean {
  for (const fire of q.surfaces) {
    if (fire.surface.kind === 'fire' && !fire.removed && Math.hypot(fire.position.x - x, fire.position.y - y) <= radius + fire.surface.radius) return true;
  }
  return false;
}

/** Grease set alight: a fire where it lay, for a while, lighting the dark. Webs burn away in a round, scorching all in them. */
function kindle(grease: Surface, by: number): void {
  const s = grease.surface;
  const web = s.kind === 'web';
  if (web) forEachBodyIn(grease, (body) => burn(body, by, WEB_FIRE_DAMAGE));
  s.kind = 'fire';
  s.ticks = web ? TURN_TICKS : KINDLED_TICKS;
  s.pulse = 0;
  s.owner = by;
  if (grease.visual) grease.visual.col = PUDDLE_FRAMES.fire;
  world.addComponent(grease, 'glow', { radius: s.radius + FIRE_LIGHT, flicker: FIRE_FLICKER });
  const { x, y } = grease.position;
  playEffect(IGNITE_EFFECT.shape, IGNITE_EFFECT.colour, x, y, 0, IGNITE_EFFECT.scale * s.radius / IGNITE_ART_RADIUS);
  playVfx('grease-ignite', x, y);
  sound.playSound('impact_fire', x, y);
}

// ── Standing in them ──────────────────────────────────────────────────────────

/** Whether a point lies in the patch: within its circle, or for webs (a cube) its square. */
function covers(surface: Surface, x: number, y: number): boolean {
  const dx = x - surface.position.x;
  const dy = y - surface.position.y;
  const r = surface.surface.radius;
  return surface.surface.kind === 'web' ? Math.abs(dx) <= r && Math.abs(dy) <= r : Math.hypot(dx, dy) <= r;
}

/** Whether a body's feet stand in the patch. */
function stands(surface: Surface, body: Entity): boolean {
  return !!body.position && covers(surface, body.position.x, body.position.y);
}

/** Whether (x, y) lies in webs. */
export function inWeb(x: number, y: number): boolean {
  for (const web of q.surfaces) if (web.surface.kind === 'web' && !web.removed && covers(web, x, y)) return true;
  return false;
}

/** Feet in webs: a Dexterity save, or the body is restrained there (for as long as the webs last). */
function caughtOrNot(body: Entity, web: Surface): void {
  if (heldIn(body, 'restrained') || (body.mobType && immuneTo(body.mobType, 'restrained'))) return;
  const dc = web.surface.dc ?? DEFAULT_GREASE_DC;
  if (dexSave(body, dc)) return;
  holdBody(body, 'restrained', 'web', web.surface.owner, dc, web.surface.ticks ?? 0);
  logLine(body, text('condition.restrained.name'), 'damage');
}

/** Every hero on their feet and live foe whose feet stand in the patch. */
function forEachBodyIn(surface: Surface, act: (body: Entity) => void): void {
  for (const hero of q.players) if (isActivePlayer(hero) && stands(surface, hero)) act(hero);
  const { x, y } = surface.position;
  for (const foe of nearby(x, y, surface.surface.radius + MAX_MOB_RADIUS, Sense.mob, scratch)) {
    if (isMob(foe) && foe.health.current > 0 && stands(surface, foe)) act(foe);
  }
}

/** A Dexterity save, shown over the head of whoever rolls it (systems/BodySaves.ts). */
const dexSave = (body: Entity, dc: number): boolean => bodySave(body, 'dexterity', dc);

/** Feet in grease: a Dexterity save, or the body slips and falls. A body that never falls prone (a specter floats) keeps going. */
function slipOrNot(body: Entity, grease: Surface): void {
  if (body.mobType && immuneTo(body.mobType, 'prone')) return;
  if (!dexSave(body, grease.surface.dc ?? DEFAULT_GREASE_DC)) knockDown(body);
}

/** A body falls prone: it neither moves nor acts until it is up again, and blows against it have advantage. */
export function knockDown(body: Entity): void {
  // Through the world the first time, so the query of those getting up holds them.
  if (isPlayer(body) && body.knockedDown === undefined) world.addComponent(body, 'knockedDown', SLIP_TICKS);
  else if (isPlayer(body)) body.knockedDown = SLIP_TICKS;
  else if (body.mobType) statusOf(body, -1).prone = Math.max(body.status?.prone ?? 0, SLIP_TICKS);
  logLine(body, text('roll.slipped'), 'miss');
  if (body.position) sound.playSound('fail', body.position.x, body.position.y);
}

/**
 * Whether a body is down or held where it stands: a hero who slipped, a foe prone or asleep (Sleep), anyone a spell holds
 * (paralysed, laughing, restrained in webs, systems/SpellHolds.ts). It does not move (nor, but for the restrained, act).
 */
export function isDown(body: Entity): boolean {
  return (body.knockedDown ?? 0) > 0 || (body.status?.prone ?? 0) > 0 || (body.status?.asleep ?? 0) > 0 || rooted(body);
}

/** The share of its pace a body at (x, y) moves at: half in grease, else all of it. */
export function terrainPace(x: number, y: number): number {
  for (const surface of q.surfaces) {
    if (flammable(surface) && covers(surface, x, y)) return GREASE_PACE;
  }
  return 1;
}

/** Whether the body stepped into this patch since last tick (it was in no patch, or another, a tick ago); notes it there now. */
function steppedIn(body: Entity, surface: Surface): boolean {
  const id = world.id(surface) ?? -1;
  const was = footing.get(body);
  const entering = !was || was.surface !== id || was.tick < tickCount - 1;
  if (was) {
    was.surface = id;
    was.tick = tickCount;
  } else {
    footing.set(body, { surface: id, tick: tickCount });
  }
  return entering;
}

/**
 * Feet in a patch this tick: stepping into grease asks a save not to slip, into webs a save not to be caught, into fire a save
 * not to catch fire.
 */
function tread(surface: Surface, body: Entity): void {
  if (!steppedIn(body, surface)) return;
  if (surface.surface.kind === 'grease') slipOrNot(body, surface);
  else if (surface.surface.kind === 'web') caughtOrNot(body, surface);
  else if (!dexSave(body, surface.surface.dc ?? DEFAULT_GREASE_DC)) setAlight(body, surface.surface.owner);
}

// ── Fire ──────────────────────────────────────────────────────────────────────

/** A body catches fire (or burns on, longer): it takes fire every round until it burns out or steps into water. */
export function setAlight(body: Entity, by: number, ticks = BURN_TICKS): void {
  if (!body.health || body.health.current <= 0) return;
  if (body.burning) {
    body.burning.ticks = Math.max(body.burning.ticks, ticks);
    return;
  }
  world.addComponent(body, 'burning', { ticks, pulse: TURN_TICKS, by });
  logLine(body, text('roll.on_fire'), 'damage');
}

/** Fire damage to a body: a hero hurt (resistances and all), a foe struck by whoever lit it. */
export function burn(body: Entity, by: number, dice: Dice, type: DamageType = 'fire'): void {
  const damage = Math.max(1, rollDice(dice));
  const source = world.entity(by) ?? body;
  if (isPlayer(body)) hurtPlayer(body, source, damage, type);
  else hitMob(body, source, damage, true, type);
}

/** A round of fire on the floor: everyone standing in it burns. */
function blaze(surface: Surface): void {
  forEachBodyIn(surface, (body) => burn(body, surface.surface.owner, FIRE_DAMAGE));
}

/** Whether a body stands in water (a puddle, charged or not). */
function inWater(body: Entity): boolean {
  for (const puddle of q.surfaces) {
    const wet = puddle.surface.kind === 'water' || puddle.surface.kind === 'shock';
    if (wet && stands(puddle, body)) return true;
  }
  return false;
}

/** A burning body burns on a tick: every round it takes fire; it burns out, dies, or is put out by water. */
function burnOn(body: Entity): void {
  const fire = body.burning;
  if (!fire) return;
  const out = (body.health?.current ?? 0) <= 0 || --fire.ticks <= 0 || inWater(body);
  if (out) {
    world.removeComponent(body, 'burning');
    return;
  }
  if (--fire.pulse > 0) return;
  fire.pulse = TURN_TICKS;
  burn(body, fire.by, FIRE_DAMAGE);
  if (body.position) playEffect(IGNITE_EFFECT.shape, IGNITE_EFFECT.colour, body.position.x, body.position.y, AIM_HEIGHT, IGNITE_EFFECT.scale / 2);
}

// ── Every tick ────────────────────────────────────────────────────────────────

const burningBodies = world.with('burning');
const downHeroes = world.with('knockedDown');

/** A patch's tick: its time runs down; fire burns every round; feet that step in are tested. */
function updateSurface(surface: Surface): void {
  const s = surface.surface;
  if (s.kind !== 'grease' && s.kind !== 'fire' && s.kind !== 'web') return;
  if (s.ticks !== undefined && --s.ticks <= 0) {
    world.addComponent(surface, 'removed', true);
    return;
  }
  forEachBodyIn(surface, (body) => tread(surface, body));
  if (s.kind !== 'fire' || --s.pulse > 0) return;
  s.pulse = TURN_TICKS;
  blaze(surface);
}

/** Grease and fire act on whoever stands in them, bodies on fire burn, and those who slipped get up. */
export function updateSurfaces(): void {
  tickCount++;
  for (const surface of q.surfaces) if (!surface.removed) updateSurface(surface);
  // Backwards: a body that burns out or gets up leaves its query as it is walked.
  for (let i = burningBodies.entities.length - 1; i >= 0; i--) burnOn(burningBodies.entities[i]);
  for (let i = downHeroes.entities.length - 1; i >= 0; i--) getUp(downHeroes.entities[i]);
}

/** A hero who slipped is a tick nearer to standing up. */
function getUp(hero: Entity): void {
  if ((hero.knockedDown ?? 0) > 1) hero.knockedDown = (hero.knockedDown ?? 0) - 1;
  else world.removeComponent(hero, 'knockedDown');
}

/** Whether a hero is down (slipped): they neither move nor act. */
export function heroDown(hero: Player): boolean {
  return (hero.knockedDown ?? 0) > 0;
}
