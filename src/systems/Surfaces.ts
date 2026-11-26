import { world, q, isActivePlayer, isMob, isPlayer } from '../world';
import type { Entity, Player, SurfaceKind } from '../world';
import { text } from '../core/texts';
import { MONSTERS } from '../rules/Monsters';
import { rollDice, rollDie } from '../rules/Dice';
import type { Dice } from '../rules/Dice';
import type { DamageType } from '../rules/DamageTypes';
import { TICKS_PER_SECOND } from '../rules/Spells';
import { nearby, Sense } from '../ai/perception/spatial';
import { MAX_MOB_RADIUS } from '../entities/MobFactory';
import { AIM_HEIGHT } from '../entities/ProjectileFactory';
import { playEffect } from '../assets/Effects';
import { playVfx } from '../render/VfxPlayer';
import { sound } from '../audio/SoundPlayer';
import { heroSavingThrow } from './FeatureSystem';
import { hurtPlayer } from './CombatSystem';
import { hitMob } from './Hits';
import { logLine } from './RollLogSystem';

/**
 * Grease and fire on the floor (the Grease spell, the flasks enemies throw, systems/ThrowSystem.ts), and what they do to
 * whoever stands in them:
 * - grease is difficult terrain — every body in it moves at half its pace — and slick: a body caught in it when it appears,
 *   or stepping into it, makes a Dexterity save or falls prone (`knockDown`): it neither moves nor acts until it is up, and
 *   blows against it have advantage. Fire takes it: grease touched by fire becomes a fire;
 * - fire burns: every round (6 s) whoever stands in it takes 1d4 fire, and a body stepping in saves or catches fire;
 * - a body on fire (`burning`) takes 1d4 fire a round until it burns out; standing in water puts it out.
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
/** The puddle art (assets/SpriteGen.ts genPuddleSheet) is this wide at scale 1 (px of its radius). */
const ART_RADIUS = 32;

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
export function spreadSurface(kind: Extract<SurfaceKind, 'grease' | 'fire'>, x: number, y: number, radius: number, owner: number, ticks: number, dc = DEFAULT_GREASE_DC): Entity {
  if (kind === 'fire') igniteGrease(x, y, radius, owner);
  const surface = world.add({
    position: { x, y }, flat: true,
    surface: { kind, radius, owner, pulse: TURN_TICKS, ...(ticks > 0 ? { ticks } : {}), dc },
    visual: { sheet: 'puddle', col: kind === 'fire' ? 3 : 2, scale: radius / ART_RADIUS },
    ...(kind === 'fire' ? { glow: { radius: radius + FIRE_LIGHT, flicker: FIRE_FLICKER } } : {}),
  });
  if (kind !== 'grease' || !isSurface(surface)) return surface;
  // Grease spilt into fire goes up at once.
  if (fireNear(x, y, radius)) {
    kindle(surface, owner);
    return surface;
  }
  forEachBodyIn(surface, (body) => slipOrNot(body, surface));
  return surface;
}

const isSurface = (e: Entity): e is Surface => !!e.surface && !!e.position;

/** Fire reached grease (a fire spell, alchemist's fire, burning floor): every grease it touches bursts into flame. */
export function igniteGrease(x: number, y: number, radius: number, by: number): void {
  for (const grease of q.surfaces) {
    if (grease.surface.kind !== 'grease' || grease.removed) continue;
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

/** Grease set alight: a fire where it lay, for a while, lighting the dark. */
function kindle(grease: Surface, by: number): void {
  const s = grease.surface;
  s.kind = 'fire';
  s.ticks = KINDLED_TICKS;
  s.pulse = 0;
  s.owner = by;
  if (grease.visual) grease.visual.col = 3;
  world.addComponent(grease, 'glow', { radius: s.radius + FIRE_LIGHT, flicker: FIRE_FLICKER });
  const { x, y } = grease.position;
  playEffect(IGNITE_EFFECT.shape, IGNITE_EFFECT.colour, x, y, 0, IGNITE_EFFECT.scale * s.radius / ART_RADIUS);
  playVfx('grease-ignite', x, y);
  sound.playSound('impact_fire', x, y);
}

// ── Standing in them ──────────────────────────────────────────────────────────

/** Whether a body's feet stand in the patch. */
function stands(surface: Surface, body: Entity): boolean {
  return !!body.position && Math.hypot(body.position.x - surface.position.x, body.position.y - surface.position.y) <= surface.surface.radius;
}

/** Every hero on their feet and live foe whose feet stand in the patch. */
function forEachBodyIn(surface: Surface, act: (body: Entity) => void): void {
  for (const hero of q.players) if (isActivePlayer(hero) && stands(surface, hero)) act(hero);
  const { x, y } = surface.position;
  for (const foe of nearby(x, y, surface.surface.radius + MAX_MOB_RADIUS, Sense.mob, scratch)) {
    if (isMob(foe) && foe.health.current > 0 && stands(surface, foe)) act(foe);
  }
}

/** A Dexterity save: a hero's own (their features and all), a foe's d20 + its monster block's modifier. */
function dexSave(body: Entity, dc: number): boolean {
  if (isPlayer(body)) return heroSavingThrow(body, 'dexterity', dc);
  const modifier = body.mobType ? MONSTERS[body.mobType].modifiers.dexterity : 0;
  return rollDie(20) + modifier >= dc;
}

/** Feet in grease: a Dexterity save, or the body slips and falls. */
function slipOrNot(body: Entity, grease: Surface): void {
  if (!dexSave(body, grease.surface.dc ?? DEFAULT_GREASE_DC)) knockDown(body);
}

/** A body falls prone: it neither moves nor acts until it is up again, and blows against it have advantage. */
export function knockDown(body: Entity): void {
  if (isPlayer(body)) body.knockedDown = SLIP_TICKS;
  else if (body.mobType) proneStatus(body).prone = Math.max(proneStatus(body).prone, SLIP_TICKS);
  logLine(body, text('roll.slipped'), 'miss');
  if (body.position) sound.playSound('fail', body.position.x, body.position.y);
}

/** A foe's marks (systems/ManeuverSystem.ts keeps them), made the first time one is given. */
function proneStatus(foe: Entity): NonNullable<Entity['status']> {
  if (!foe.status) world.addComponent(foe, 'status', { prone: 0, frightened: 0, goaded: 0, distracted: 0, eldritch: 0, charmed: 0, by: -1 });
  return foe.status ?? { prone: 0, frightened: 0, goaded: 0, distracted: 0, eldritch: 0, charmed: 0, by: -1 };
}

/** Whether a body is down: a hero who slipped, a foe prone. It neither moves nor acts. */
export function isDown(body: Entity): boolean {
  return (body.knockedDown ?? 0) > 0 || (body.status?.prone ?? 0) > 0;
}

/** The share of its pace a body at (x, y) moves at: half in grease, else all of it. */
export function terrainPace(x: number, y: number): number {
  for (const surface of q.surfaces) {
    if (surface.surface.kind !== 'grease') continue;
    if (Math.hypot(x - surface.position.x, y - surface.position.y) <= surface.surface.radius) return GREASE_PACE;
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

/** Feet in a patch this tick: stepping into grease asks a save not to slip, stepping into fire a save not to catch fire. */
function tread(surface: Surface, body: Entity): void {
  if (!steppedIn(body, surface)) return;
  if (surface.surface.kind === 'grease') slipOrNot(body, surface);
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
  if (s.kind !== 'grease' && s.kind !== 'fire') return;
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
  for (const body of burningBodies.entities.slice()) burnOn(body);
  for (const hero of downHeroes.entities.slice()) getUp(hero);
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
