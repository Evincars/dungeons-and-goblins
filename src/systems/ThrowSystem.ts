import { world, q, isActivePlayer, isMob, isPlayer, Team } from '../world';
import type { Entity } from '../world';
import type { Level } from '../level/Level';
import { MONSTERS } from '../rules/Monsters';
import { rollDie } from '../rules/Dice';
import { THROWABLES } from '../rules/Throwables';
import type { ThrowableDef, ThrowableId } from '../rules/Throwables';
import { CLOSE_QUARTERS_PX } from '../rules/CloseQuarters';
import { ATTACK_PERIOD } from '../entities/WeaponStats';
import { nearby, Sense } from '../ai/perception/spatial';
import { MAX_MOB_RADIUS } from '../entities/MobFactory';
import { playVfx } from '../render/VfxPlayer';
import { sound } from '../audio/SoundPlayer';
import { isBackingOff } from '../ai/execution/skirmish';
import { heroSavingThrow } from './FeatureSystem';
import { targetFor } from './EnemyRangedSystem';
import { burn, isDown, setAlight, spreadSurface } from './Surfaces';
import { logLine } from './RollLogSystem';
import { text } from '../core/texts';

/**
 * Flasks thrown at the heroes (src/data/throwables.json): an enemy that carries one (`mobThrowable`) throws it, now and
 * then, at a hero it sees on their screen, beyond arm's reach and within the flask's range — where most heroes stand
 * together. The flask flies in an arc (`thrown`) and bursts where it lands: Alchemist's Fire splashes everyone near with
 * fire (a Dexterity save, or they burn) and leaves the floor burning; the Grease Bottle leaves slick grease (systems/Surfaces.ts).
 * The host's work alone; guests see the flask fly in the world it sends.
 */

/** An enemy weighs throwing this often (ticks), and throws on this share of those (so not the instant it sees a hero). */
const THINK_TICKS = 20;
const THROW_CHANCE = 0.5;
/** A flask is thrown only at a hero this far beyond the edge of its own splash (px), so the thrower stays out of it. */
const SPLASH_CLEARANCE = 12;
/** A flask flies this fast (px a tick), never for less than this many ticks, and rises this high (px) at the top of its arc. */
const FLASK_SPEED = 4;
const MIN_FLIGHT = 14;
const ARC_HEIGHT = 36;
/** The flask leaves the thrower's hand this high above their feet. */
const HAND_HEIGHT = 14;

const carriers = world.with('position', 'velocity', 'mobType', 'mobThrowable', 'health', 'ai');
type Carrier = (typeof carriers)['entities'][number];
const flying = world.with('thrown', 'position');
type Flask = (typeof flying)['entities'][number];
const scratch: Entity[] = [];

/** How many heroes on their feet stand within the splash if it lands at (x, y). */
function heroesNear(x: number, y: number, radius: number): number {
  let count = 0;
  for (const hero of q.players) if (isActivePlayer(hero) && Math.hypot(hero.position.x - x, hero.position.y - y) <= radius) count++;
  return count;
}

/** Whether the enemy could throw now: carrying a flask, fighting, on its feet, not backing off, its arm free. */
function readyToThrow(mob: Carrier, tick: number): boolean {
  if (mob.mobThrowable.count <= 0 || mob.removed || mob.health.current <= 0 || isDown(mob)) return false;
  if (mob.ai.state !== 'engage' || (mob.attackCooldown ?? 0) > 0 || (isMob(mob) && isBackingOff(mob))) return false;
  return (tick + (world.id(mob) ?? 0)) % THINK_TICKS === 0 && Math.random() < THROW_CHANCE;
}

/** Throws the enemy's flask at the hero it sees, if one stands beyond arm's reach and within range, where most heroes stand. */
function considerThrow(level: Level, mob: Carrier, tick: number): void {
  if (!readyToThrow(mob, tick)) return;
  const def = THROWABLES[mob.mobThrowable.item];
  const hero = targetFor(level, mob, def.range);
  if (!hero) return;
  const d = Math.hypot(hero.position.x - mob.position.x, hero.position.y - mob.position.y);
  // Not into its own face: a flask is thrown from beyond arm's reach, and from outside its own splash.
  if (d <= Math.max(CLOSE_QUARTERS_PX, def.radius + SPLASH_CLEARANCE)) return;
  throwFlask(mob, def, hero.position.x, hero.position.y);
  if (heroesNear(hero.position.x, hero.position.y, def.radius) > 1) logLine(mob, text('roll.throws'), 'damage');
}

/** The flask leaves the hand towards (x, y): it flies for as long as the distance takes, in an arc. */
export function throwFlask(thrower: Entity, def: ThrowableDef, x: number, y: number): Entity {
  const from = thrower.position ?? { x, y };
  const total = Math.max(MIN_FLIGHT, Math.round(Math.hypot(x - from.x, y - from.y) / FLASK_SPEED));
  if (thrower.mobThrowable) thrower.mobThrowable.count--;
  thrower.attackCooldown = ATTACK_PERIOD;
  thrower.attackTime = ATTACK_PERIOD / 2;
  sound.playSound('sword_swing', from.x, from.y);
  const team = isPlayer(thrower) ? Team.Player : Team.Mob;
  return world.add({
    position: { x: from.x, y: from.y }, yOffset: HAND_HEIGHT,
    thrown: { item: def.id, owner: world.id(thrower) ?? -1, team, fromX: from.x, fromY: from.y, toX: x, toY: y, ticks: 0, total },
  });
}

/** A flask a tick further along its arc; it bursts where it lands. */
function fly(flask: Flask): void {
  const t = flask.thrown;
  t.ticks++;
  const share = Math.min(1, t.ticks / t.total);
  flask.position.x = t.fromX + (t.toX - t.fromX) * share;
  flask.position.y = t.fromY + (t.toY - t.fromY) * share;
  flask.yOffset = HAND_HEIGHT * (1 - share) + Math.sin(share * Math.PI) * ARC_HEIGHT;
  if (share < 1) return;
  world.addComponent(flask, 'removed', true);
  land(t.item, t.toX, t.toY, t.owner);
}

/** A Dexterity save against the flask: a hero's own, a foe's d20 + its modifier. */
function dodges(body: Entity, def: ThrowableDef): boolean {
  if (isPlayer(body)) return heroSavingThrow(body, def.save, def.dc);
  const modifier = body.mobType ? MONSTERS[body.mobType].modifiers[def.save] : 0;
  return rollDie(20) + modifier >= def.dc;
}

/** One body in the splash of liquid fire: a save, or it takes the fire and burns on. */
function splash(body: Entity, def: ThrowableDef, owner: number): void {
  if (dodges(body, def)) return;
  if (def.damage) burn(body, owner, def.damage, def.damageType);
  if (def.burnTicks > 0) setAlight(body, owner, def.burnTicks);
}

/** Every hero on their feet and live foe within the splash of a flask that landed at (x, y). */
function splashed(x: number, y: number, radius: number, act: (body: Entity) => void): void {
  for (const hero of q.players) if (isActivePlayer(hero) && Math.hypot(hero.position.x - x, hero.position.y - y) <= radius) act(hero);
  for (const foe of nearby(x, y, radius + MAX_MOB_RADIUS, Sense.mob, scratch)) {
    if (isMob(foe) && foe.health.current > 0 && Math.hypot(foe.position.x - x, foe.position.y - y) <= radius) act(foe);
  }
}

/** The flask bursts where it landed: its particles, its splash (fire hurts and sets alight), and what it leaves on the floor. */
export function land(item: ThrowableId, x: number, y: number, owner: number): void {
  const def = THROWABLES[item];
  playVfx(def.surface === 'fire' ? 'alchemists-fire' : 'grease-splash', x, y);
  sound.playSound(def.surface === 'fire' ? 'impact_fire' : 'impact_dark', x, y);
  if (def.damage || def.burnTicks > 0) splashed(x, y, def.radius, (body) => splash(body, def, owner));
  spreadSurface(def.surface, x, y, def.radius, owner, def.surfaceTicks, def.surfaceDc);
}

/** Host, after the enemies have moved: those carrying a flask may throw it, and flasks in the air fly on and burst. */
export function updateThrows(level: Level, tick: number): void {
  for (const mob of carriers) considerThrow(level, mob, tick);
  for (const flask of flying.entities.slice()) if (!flask.removed) fly(flask);
}
