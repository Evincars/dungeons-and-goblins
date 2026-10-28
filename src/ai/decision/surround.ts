import type { Mob } from '../../world';
import type { Squad } from './squads';

/**
 * Surrounding the target: every member of a squad is given its own place in a ring round the player it hunts,
 * the places spread evenly, so a pack closes in from every side instead of piling up on one, and each of them
 * ends up within reach. Members keep the order they already stand in round the target (nobody has to cross
 * another's path), and the ring is turned to sit where the pack already is, so the fewest steps put them in place.
 * Places are handed out afresh every tick: they follow the player as they move.
 */

/** A member's place in the ring: the angle round the target, and the tick it was handed out on. */
type Place = { angle: number; tick: number };
const places = new WeakMap<Mob, Place>();

/** A member and the angle it stands at round the target, pooled and sorted by that angle. */
type Bearing = { mob: Mob | null; angle: number };
const pool: Bearing[] = [];
const ranked: Bearing[] = [];
const byAngle = (a: Bearing, b: Bearing): number => a.angle - b.angle;

function rank(squad: Squad): void {
  const t = squad.target.position;
  ranked.length = 0;
  for (const mob of squad.members) {
    const bearing = pool[ranked.length] ?? (pool[ranked.length] = { mob: null, angle: 0 });
    bearing.mob = mob;
    bearing.angle = Math.atan2(mob.position.y - t.y, mob.position.x - t.x);
    ranked.push(bearing);
  }
  ranked.sort(byAngle);
}

/**
 * The turn of the ring that sits best on where the members stand: the circular mean of how far each stands from
 * its place were the ring not turned at all.
 */
function ringTurn(step: number): number {
  let x = 0;
  let y = 0;
  for (let k = 0; k < ranked.length; k++) {
    const off = ranked[k].angle - k * step;
    x += Math.cos(off);
    y += Math.sin(off);
  }
  return Math.atan2(y, x);
}

/** Hands every member of the squad its place in the ring round its target for this tick. */
export function surround(squad: Squad, tick: number): void {
  if (squad.members.length === 0) return;
  rank(squad);
  const step = (2 * Math.PI) / ranked.length;
  const turn = ringTurn(step);
  for (let k = 0; k < ranked.length; k++) {
    const mob = ranked[k].mob;
    if (!mob) continue;
    let place = places.get(mob);
    if (!place) places.set(mob, (place = { angle: 0, tick }));
    place.angle = turn + k * step;
    place.tick = tick;
  }
  for (const bearing of ranked) bearing.mob = null;
}

/** The angle round its target of the enemy's place in the ring this tick, or undefined if it has none. */
export function ringAngle(mob: Mob, tick: number): number | undefined {
  const place = places.get(mob);
  return place && place.tick === tick ? place.angle : undefined;
}
