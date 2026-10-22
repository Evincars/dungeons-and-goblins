import type { Level } from '../../level/Level';
import { TileType } from '../../level/TileType';
import { Facing } from '../../world';
import type { Mob } from '../../world';
import { CHASE_SPEED_FACTOR, PIT_LOOKAHEAD, WALK_SPEED, WANDER_TURN_TICKS } from '../constants';

/** Unit steps for each Facing: north, east, south, west. */
const FACING_STEPS = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;
const FACINGS = [Facing.North, Facing.East, Facing.South, Facing.West] as const;
/** Walk cycles are this many ticks long; a limp skips one cycle in `limp`. */
const LIMP_CYCLE = 12;

/** Whether a pit lies just ahead of the mob in direction (dx, dy). */
function pitAhead(level: Level, mob: Mob, dx: number, dy: number): boolean {
  const len = Math.hypot(dx, dy) || 1;
  const ahead = level.getTileAt(mob.position.x + (dx / len) * PIT_LOOKAHEAD, mob.position.y + (dy / len) * PIT_LOOKAHEAD);
  return ahead?.type === TileType.Hole;
}

/** An enemy after a player it has spotted (fighting or tracking them) runs instead of strolling. */
export function hunting(mob: Mob): boolean {
  return mob.ai.state === 'engage' || mob.ai.state === 'search';
}

/** Turns the mob's facing and its sight heading toward (dx, dy). */
export function faceTowards(mob: Mob, dx: number, dy: number): void {
  const len = Math.hypot(dx, dy);
  if (len === 0) return;
  mob.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? Facing.East : Facing.West) : (dy > 0 ? Facing.South : Facing.North);
  mob.aimVector ??= { x: 0, y: 1 };
  mob.aimVector.x = dx / len;
  mob.aimVector.y = dy / len;
}

/**
 * Pushes the mob along (dx, dy). Hunting enemies don't shy from pit edges: a player standing at one must
 * still be reached, and the movement system already keeps enemies from stepping into a pit.
 */
export function walkTowards(_level: Level, mob: Mob, dx: number, dy: number): boolean {
  const len = Math.hypot(dx, dy) || 1;
  const speed = (mob.speed ?? WALK_SPEED) * (hunting(mob) ? CHASE_SPEED_FACTOR : 1);
  mob.velocity.x += (dx / len) * speed;
  mob.velocity.y += (dy / len) * speed;
  faceTowards(mob, dx, dy);
  return true;
}

/** Wandering enemies keep clear of pits: pushes along (dx, dy) unless one lies just ahead; returns whether it moved. */
function stroll(level: Level, mob: Mob, dx: number, dy: number): boolean {
  if (pitAhead(level, mob, dx, dy)) return false;
  return walkTowards(level, mob, dx, dy);
}

/** Catacomb Snatch's limp: the mob skips movement on part of its walk cycle, so mobs read as slow and lurching. */
export function limping(mob: Mob): boolean {
  mob.walkTime = (mob.walkTime ?? 0) + 1;
  const limp = mob.limp ?? 0;
  return limp > 0 && Math.floor(mob.walkTime / LIMP_CYCLE) % limp === 0;
}

/** A random direction without a pit ahead, other than the current one; the current one if none is clear. */
function clearFacing(level: Level, mob: Mob, current: Facing): Facing {
  let pick = current;
  let seen = 0;
  for (const f of FACINGS) {
    if (f === current || pitAhead(level, mob, FACING_STEPS[f][0], FACING_STEPS[f][1])) continue;
    // Reservoir sampling: every clear direction is equally likely, without building a list.
    seen++;
    if (Math.random() * seen < 1) pick = f;
  }
  return pick;
}

/** Ambles in one direction, turning now and then, and away from pits. */
export function wander(level: Level, mob: Mob): void {
  if ((mob.walkTime ?? 0) % WANDER_TURN_TICKS === 0 || mob.facing === undefined) {
    mob.facing = FACINGS[Math.floor(Math.random() * FACINGS.length)];
  }
  const facing = FACINGS[mob.facing] ?? Facing.South;
  if (stroll(level, mob, FACING_STEPS[facing][0], FACING_STEPS[facing][1])) return;
  mob.facing = clearFacing(level, mob, facing);
}
