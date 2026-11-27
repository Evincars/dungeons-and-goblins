import { world, q, isActivePlayer, isMob, isPlayer } from '../world';
import type { Entity, Player } from '../world';
import type { Level } from '../level/Level';
import { SPELLS } from '../rules/Spells';
import type { SpellDef } from '../rules/Spells';
import { characterSheet, spellcastingFor } from '../rules/CharacterSheet';
import { castDef } from '../rules/Spellbook';
import { inArea } from '../rules/SpellArea';
import { nearby, Sense } from '../ai/perception/spatial';
import { MAX_MOB_RADIUS } from '../entities/MobFactory';
import { screenToWorld } from '../render/Camera';
import { playVfx } from '../render/VfxPlayer';
import { text } from '../core/texts';
import { logLine } from './RollLogSystem';
import { bodySave } from './BodySaves';
import { concentrate, endConcentration } from './LastingSpells';
import { AIM_HEIGHT } from '../entities/ProjectileFactory';

/**
 * Gust of Wind: a line of strong wind from the caster's hands towards their aim, 60 feet long and 10 wide (`area: line`, its
 * size in src/data/spells.json), held by concentration while it lasts. It blows from the caster and turns where they aim. Each
 * creature in it saves (Strength) at once and at the end of every round after, or is blown 15 feet away along the line — over
 * the brink of a pit or a chasm, if one lies that way (systems/MovementSystem.ts lets a shove carry a body over one); walking
 * back into it costs twice the pace. It scatters fog and gas (Fog Cloud, Cloudkill) it blows through. An enemy caster
 * (systems/EnemyRangedSystem.ts) casts it only where it would blow a hero over a drop, a single blast.
 */

/** A round of the tabletop game: the wind pushes again at the end of each. */
const TURN_TICKS = 360;
/** A shove carries a body this fast (px a tick) until it has gone its distance. */
const SHOVE_SPEED = 6;
/** Walking against the wind, a body moves at this share of its pace. */
const HEADWIND_PACE = 0.5;
/** The line's drop is looked for every this many px along a push. */
const DROP_STEP = 8;
/** The wind shows a blast of streaks along the line this often while it lasts (ticks). */
const BLAST_SHOW_TICKS = 40;

const gusts = world.with('gust', 'position');
const fogs = world.with('fogCloud', 'position');
type Gust = (typeof gusts)['entities'][number];
const scratch: Entity[] = [];
const from = { x: 0, y: 0 };
const centre = { x: 0, y: 0 };
const aim = { x: 0, y: 0 };

/** A body is shoved this far (px) along (dirX, dirY): it slides there over a few ticks, and may go over a brink. */
export function shove(body: Entity, dirX: number, dirY: number, distance: number): void {
  const ticks = Math.max(1, Math.round(distance / SHOVE_SPEED));
  const push = { x: dirX * SHOVE_SPEED, y: dirY * SHOVE_SPEED, ticks };
  if (body.shove) Object.assign(body.shove, push);
  else world.addComponent(body, 'shove', push);
}

/** Whether a drop (a pit, a chasm) lies along (dirX, dirY) from (x, y) within `reach` px: a push that way would drop a body in. */
export function dropAlong(level: Level, x: number, y: number, dirX: number, dirY: number, reach: number): boolean {
  for (let d = DROP_STEP; d <= reach; d += DROP_STEP) {
    const px = x + dirX * d;
    const py = y + dirY * d;
    if (level.overPit(px, py)) return true;
    if (level.blocksPoint(px, py)) return false;
  }
  return false;
}

/** The line's far end from `origin` blowing along (dirX, dirY), for the area test (rules/SpellArea.ts). */
function lineEnd(def: SpellDef, origin: { x: number; y: number }, dirX: number, dirY: number): { x: number; y: number } {
  centre.x = origin.x + dirX * def.range;
  centre.y = origin.y + dirY * def.range;
  return centre;
}

/** Whether a body stands in the wind's line. */
function inLine(def: SpellDef, origin: { x: number; y: number }, end: { x: number; y: number }, body: Entity): boolean {
  if (!body.position) return false;
  return inArea(def, origin, end, body.position.x, body.position.y, Math.max(body.radius?.x ?? 0, body.radius?.y ?? 0));
}

/** One body the wind catches: a Strength save, or it is blown back along the line. */
function blowOn(body: Entity, def: SpellDef, dirX: number, dirY: number, dc: number): void {
  if (bodySave(body, 'strength', dc)) return;
  shove(body, dirX, dirY, def.push);
  logLine(body, text('roll.pushed'), 'damage');
}

/** The wind scatters the fog and gas it blows through (Fog Cloud, Cloudkill; not Darkness, which is no vapour). */
function scatterFog(def: SpellDef, origin: { x: number; y: number }, end: { x: number; y: number }): void {
  for (const fog of fogs) {
    if (fog.removed || fog.fogCloud.dark || !inArea(def, origin, end, fog.position.x, fog.position.y, fog.fogCloud.radius)) continue;
    world.addComponent(fog, 'removed', true);
  }
  for (const zone of q.zones) {
    if (zone.removed || zone.zone.spell !== 'cloudkill' || !inArea(def, origin, end, zone.position.x, zone.position.y, SPELLS.cloudkill.radius)) continue;
    world.addComponent(zone, 'removed', true);
  }
}

/** An enemy's blast catches the heroes in its line. */
function blowOnHeroes(def: SpellDef, origin: { x: number; y: number }, end: { x: number; y: number }, dirX: number, dirY: number, dc: number): void {
  for (const hero of q.players) if (isActivePlayer(hero) && inLine(def, origin, end, hero)) blowOn(hero, def, dirX, dirY, dc);
}

/** One blast of the wind from `origin` along (dirX, dirY): its streaks, then everyone caught on the other side saves. */
function blast(def: SpellDef, origin: { x: number; y: number }, dirX: number, dirY: number, dc: number, onHeroes: boolean): void {
  const end = lineEnd(def, origin, dirX, dirY);
  playVfx('gust-of-wind', origin.x, origin.y, AIM_HEIGHT, dirX, dirY);
  scatterFog(def, origin, end);
  if (onHeroes) {
    blowOnHeroes(def, origin, end, dirX, dirY, dc);
    return;
  }
  const midX = (origin.x + end.x) / 2;
  const midY = (origin.y + end.y) / 2;
  for (const foe of nearby(midX, midY, def.range / 2 + def.radius + MAX_MOB_RADIUS, Sense.mob, scratch)) {
    if (isMob(foe) && foe.health.current > 0 && inLine(def, origin, end, foe)) blowOn(foe, def, dirX, dirY, dc);
  }
}

/** An enemy's gust at the heroes: one blast the way it aims. */
export function gustFrom(mob: Entity, def: SpellDef, dirX: number, dirY: number, dc: number): void {
  if (mob.position) blast(def, mob.position, dirX, dirY, dc, true);
}

/** A hero casts Gust of Wind: the wind blows at once along their aim, and on while their concentration holds it. */
export function castGust(caster: Player, def: SpellDef, dirX: number, dirY: number): void {
  const gust = world.add({
    position: { x: caster.position.x, y: caster.position.y },
    gust: { owner: world.id(caster) ?? -1, ticks: def.durationTicks, pulse: TURN_TICKS, dirX, dirY, level: def.level },
  });
  concentrate(caster, def.id, world.id(gust) ?? -1, def.durationTicks);
  blast(def, caster.position, dirX, dirY, spellcastingFor(characterSheet(caster), def.id).dc, false);
}

/** Where the caster aims now: their crosshair (this screen's pointer, or the one a guest sent). */
function aimOf(caster: Player): { x: number; y: number } {
  return caster.aimWorld ?? screenToWorld(caster.playerInput.mouseX, caster.playerInput.mouseY, aim);
}

/** The wind turns where its caster aims (from their hands), and follows them. */
function turnWithCaster(gust: Gust, caster: Player): void {
  gust.position.x = caster.position.x;
  gust.position.y = caster.position.y;
  const target = aimOf(caster);
  const dx = target.x - caster.position.x;
  const dy = target.y - (caster.position.y - AIM_HEIGHT);
  const len = Math.hypot(dx, dy);
  if (len === 0) return;
  gust.gust.dirX = dx / len;
  gust.gust.dirY = dy / len;
}

/** A gust a tick on: it goes when its caster lets go of it; it shows its streaks now and then and blows again each round. */
function updateGust(gust: Gust): void {
  const caster = world.entity(gust.gust.owner);
  const held = isPlayer(caster) && isActivePlayer(caster) && caster.concentration?.zone === world.id(gust);
  if (!held || --gust.gust.ticks <= 0) {
    world.addComponent(gust, 'removed', true);
    if (isPlayer(caster) && caster.concentration?.zone === world.id(gust)) endConcentration(caster);
    return;
  }
  turnWithCaster(gust, caster);
  const g = gust.gust;
  if (g.ticks % BLAST_SHOW_TICKS === 0) playVfx('gust-of-wind', gust.position.x, gust.position.y, AIM_HEIGHT, g.dirX, g.dirY);
  if (--g.pulse > 0) return;
  g.pulse = TURN_TICKS;
  const def = castDef(SPELLS.gust_of_wind, g.level, caster.playerStats.level);
  blast(def, gust.position, g.dirX, g.dirY, spellcastingFor(characterSheet(caster), def.id).dc, false);
}

/** Host, each tick: the gusts follow their casters and blow; shoves carry bodies on (systems/MovementSystem.ts moves them). */
export function updateGusts(): void {
  for (let i = gusts.entities.length - 1; i >= 0; i--) {
    const gust = gusts.entities[i];
    if (!gust.removed) updateGust(gust);
  }
}

/** The pace a body walks at against the wind: half, walking back towards a gust's caster within its line; else all of it. */
export function windPace(body: Entity): number {
  const v = body.velocity;
  if (!v || (v.x === 0 && v.y === 0) || gusts.entities.length === 0) return 1;
  for (const gust of gusts) {
    if (gust.removed || world.id(body) === gust.gust.owner) continue;
    from.x = gust.position.x;
    from.y = gust.position.y;
    const def = SPELLS.gust_of_wind;
    const end = lineEnd(def, from, gust.gust.dirX, gust.gust.dirY);
    if (inLine(def, from, end, body) && v.x * gust.gust.dirX + v.y * gust.gust.dirY < 0) return HEADWIND_PACE;
  }
  return 1;
}

/** Whether a body is being shoved (and may be carried over a brink). */
export function beingShoved(body: Entity): boolean {
  return (body.shove?.ticks ?? 0) > 0;
}

/** A shove's push this tick (into `out`), counting it down; zero once it has gone its distance. */
export function shoveStep(body: Entity, out: { x: number; y: number }): { x: number; y: number } {
  const push = body.shove;
  out.x = out.y = 0;
  if (!push) return out;
  out.x = push.x;
  out.y = push.y;
  if (--push.ticks <= 0) world.removeComponent(body, 'shove');
  return out;
}
