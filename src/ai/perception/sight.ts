import type { Level } from '../../level/Level';
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

/** Whether the mob can see the player: within sight range in the open, with nothing solid between them. */
export function canSee(level: Level, mob: Mob, player: Player): boolean {
  if (!huntable(level, player)) return false;
  const dx = player.position.x - mob.position.x;
  const dy = player.position.y - mob.position.y;
  const d2 = dx * dx + dy * dy;
  if (d2 > SIGHT_RANGE * SIGHT_RANGE) return false;
  return level.checkLineOfSight(mob.position.x, mob.position.y, player.position.x, player.position.y);
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
