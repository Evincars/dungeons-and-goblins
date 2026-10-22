import type { Level } from '../../level/Level';
import { WALL_SINK } from '../../level/Level';
import { isActivePlayer, isPlayer } from '../../world';
import type { Entity, Mob, Player } from '../../world';
import { SIGHT_RANGE } from '../constants';
import { nearby, Sense } from './spatial';

/** Players the sight check is run over; reused so looking around allocates nothing. */
const candidates: Entity[] = [];

/** A player enemies can perceive at all: alive, on their feet, and outside the safe rooms. */
export function huntable(level: Level, player: Player): boolean {
  return isActivePlayer(player) && !player.falling && !level.isWorldPosSafe(player.position.x, player.position.y);
}

/**
 * Where someone looks from: their feet, unless those have sunk into the edge of a wall below them — then
 * from the floor just above, where their body is (a line along the wall row would run through the wall).
 */
function eyeY(level: Level, x: number, y: number): number {
  return level.getTileAt(x, y)?.passable === false ? y - WALL_SINK : y;
}

/** Whether the mob can see the player: within sight range in the open, with nothing solid between them. */
export function canSee(level: Level, mob: Mob, player: Player): boolean {
  if (!huntable(level, player)) return false;
  const dx = player.position.x - mob.position.x;
  const dy = player.position.y - mob.position.y;
  const d2 = dx * dx + dy * dy;
  if (d2 > SIGHT_RANGE * SIGHT_RANGE) return false;
  const { x: mx, y: my } = mob.position;
  const { x: px, y: py } = player.position;
  return level.checkLineOfSight(mx, eyeY(level, mx, my), px, eyeY(level, px, py));
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
