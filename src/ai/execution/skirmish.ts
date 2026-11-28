import type { Level } from '../../level/Level';
import type { Mob, Player } from '../../world';
import { BACK_OFF_MARGIN, SENSE_TICKS, SKIRMISH_MAX, SKIRMISH_MIN, WAIT_ARRIVED, WAIT_RADIUS } from '../constants';
import { clearLine } from '../perception/navigation';
import { walkToPoint } from './pursuit';

/**
 * How an enemy fights when it does not press in hand to hand (decision/engagement.ts): a skirmisher — a bow, a crossbow,
 * spells — keeps its target between SKIRMISH_MIN and SKIRMISH_MAX, backing off from a hero who comes too close (a ranged
 * attack with a foe within 5 feet is at disadvantage) and closing in when out of reach or sight; between them it stands
 * and shoots (systems/EnemyRangedSystem.ts). One waiting its turn holds off at WAIT_RADIUS round the fight, facing it.
 */

type Point = { x: number; y: number };
const spot: Point = { x: 0, y: 0 };
/** The enemies backing off this tick (they do not stop to shoot), by the tick they were last seen doing it. */
const backingOff = new WeakMap<Mob, number>();
let currentTick = 0;

/** Where the target is as far as the enemy knows: where it stands when just seen, else where it was last seen. */
function known(mob: Mob, target: Player, tick: number, out: Point): Point {
  const fresh = tick - mob.ai.lastSeenTick <= SENSE_TICKS;
  out.x = fresh ? target.position.x : mob.ai.lastSeenX;
  out.y = fresh ? target.position.y : mob.ai.lastSeenY;
  return out;
}

/** The point `distance` from (x, y) on the enemy's side of it (straight out from it, the way the enemy already stands). */
function outFrom(mob: Mob, x: number, y: number, distance: number): Point {
  const dx = mob.position.x - x;
  const dy = mob.position.y - y;
  const d = Math.hypot(dx, dy) || 1;
  spot.x = x + (dx / d) * distance;
  spot.y = y + (dy / d) * distance;
  return spot;
}

/** The enemy stands where it is, facing its target. */
function stand(mob: Mob, x: number, y: number): void {
  mob.velocity.x = 0;
  mob.velocity.y = 0;
  const dx = x - mob.position.x;
  const dy = y - mob.position.y;
  const d = Math.hypot(dx, dy) || 1;
  mob.aimVector ??= { x: 0, y: 1 };
  mob.aimVector.x = dx / d;
  mob.aimVector.y = dy / d;
}

/** A skirmisher's tick: back off from a hero too close, close in on one out of reach or sight, else hold and shoot. */
export function skirmish(level: Level, mob: Mob, target: Player, tick: number): void {
  currentTick = tick;
  const at = known(mob, target, tick, { x: 0, y: 0 });
  const d = Math.hypot(at.x - mob.position.x, at.y - mob.position.y);
  const inSight = clearLine(level, mob.position.x, mob.position.y, at.x, at.y);
  if (d < SKIRMISH_MIN) {
    const away = outFrom(mob, at.x, at.y, SKIRMISH_MIN + BACK_OFF_MARGIN);
    backingOff.set(mob, tick);
    walkToPoint(level, mob, away.x, away.y);
    return;
  }
  if (d > SKIRMISH_MAX || !inSight) {
    walkToPoint(level, mob, at.x, at.y);
    return;
  }
  stand(mob, at.x, at.y);
}

/** A melee fighter waiting its turn: it walks to its spot WAIT_RADIUS out from the fight and stands there, facing it. */
export function holdOff(level: Level, mob: Mob, target: Player, tick: number): void {
  const at = known(mob, target, tick, { x: 0, y: 0 });
  const wait = outFrom(mob, at.x, at.y, WAIT_RADIUS);
  if (Math.hypot(wait.x - mob.position.x, wait.y - mob.position.y) > WAIT_ARRIVED) {
    walkToPoint(level, mob, wait.x, wait.y);
    return;
  }
  stand(mob, at.x, at.y);
}

/** Whether the enemy is backing off from a hero this tick (it does not stop to shoot then). */
export function isBackingOff(mob: Mob): boolean {
  return backingOff.get(mob) === currentTick;
}
