import type { Level } from '../../level/Level';
import { isActivePlayer, isPlayer } from '../../world';
import type { Entity, Mob, Player } from '../../world';
import { HEARING_RANGE, SIGHT_CONE_COS, SIGHT_RANGE } from '../constants';
import { nearby, Sense } from './spatial';

/** Players the sight check is run over; reused so looking around allocates nothing. */
const candidates: Entity[] = [];

/** A player enemies can perceive at all: alive, on their feet, and outside the safe rooms. */
export function huntable(level: Level, player: Player): boolean {
  return isActivePlayer(player) && !player.falling && !level.isWorldPosSafe(player.position.x, player.position.y);
}

/**
 * Whether the mob can see the player: in range, with nothing solid between them. Unless `anyDirection`
 * (an enemy already fighting keeps track all round), the player must also be in front of it or close
 * enough to be heard, so players can sneak up from behind.
 */
export function canSee(level: Level, mob: Mob, player: Player, anyDirection = false): boolean {
  if (!huntable(level, player)) return false;
  const dx = player.position.x - mob.position.x;
  const dy = player.position.y - mob.position.y;
  const d2 = dx * dx + dy * dy;
  if (d2 > SIGHT_RANGE * SIGHT_RANGE) return false;
  if (!anyDirection && d2 > HEARING_RANGE * HEARING_RANGE && !inFront(mob, dx, dy, d2)) return false;
  return level.checkLineOfSight(mob.position.x, mob.position.y, player.position.x, player.position.y);
}

/** Whether the direction (dx, dy) lies within the mob's field of view around where it is heading. */
function inFront(mob: Mob, dx: number, dy: number, d2: number): boolean {
  const heading = mob.aimVector;
  if (!heading) return true;
  return (heading.x * dx + heading.y * dy) / Math.sqrt(d2) >= SIGHT_CONE_COS;
}

/** The nearest player the mob has just spotted, or null. */
export function spotPlayer(level: Level, mob: Mob): Player | null {
  let best: Player | null = null;
  let bestD = Infinity;
  for (const e of nearby(mob.position.x, mob.position.y, SIGHT_RANGE, Sense.player, candidates)) {
    if (!isPlayer(e) || !canSee(level, mob, e)) continue;
    const d = (e.position.x - mob.position.x) ** 2 + (e.position.y - mob.position.y) ** 2;
    if (d >= bestD) continue;
    bestD = d;
    best = e;
  }
  return best;
}
