import type { Level } from '../../level/Level';
import type { Trail } from '../../world';
import { TRAIL_LENGTH } from '../constants';

/**
 * A player's trail: the centres of the tiles they walked onto, newest last, in a fixed ring so walking
 * allocates nothing. Enemies that lose sight of a player follow it crumb by crumb to where they went.
 */

export function createTrail(): Trail {
  return {
    xs: new Float32Array(TRAIL_LENGTH),
    ys: new Float32Array(TRAIL_LENGTH),
    ticks: new Float64Array(TRAIL_LENGTH),
    head: 0,
    count: 0,
    lastTile: -1,
  };
}

/** Drops a crumb when the player has stepped onto a new tile. */
export function recordTrail(level: Level, trail: Trail, x: number, y: number, tick: number): void {
  const tile = level.tileIndexAt(x, y);
  if (tile === trail.lastTile) return;
  trail.lastTile = tile;
  trail.xs[trail.head] = level.tileCentreX(tile);
  trail.ys[trail.head] = level.tileCentreY(tile);
  trail.ticks[trail.head] = tick;
  trail.head = (trail.head + 1) % TRAIL_LENGTH;
  trail.count = Math.min(trail.count + 1, TRAIL_LENGTH);
}

/** Ring slot of the i-th crumb, oldest first. */
function slotOf(trail: Trail, i: number): number {
  return (trail.head - trail.count + i + TRAIL_LENGTH) % TRAIL_LENGTH;
}

/** Position (oldest first) of the oldest crumb dropped after `tick`, or -1 when there is none. */
export function crumbAfter(trail: Trail, tick: number): number {
  for (let i = 0; i < trail.count; i++) {
    if (trail.ticks[slotOf(trail, i)] > tick) return i;
  }
  return -1;
}

export function crumbCount(trail: Trail): number {
  return trail.count;
}

export function crumbX(trail: Trail, i: number): number {
  return trail.xs[slotOf(trail, i)];
}

export function crumbY(trail: Trail, i: number): number {
  return trail.ys[slotOf(trail, i)];
}

export function crumbTick(trail: Trail, i: number): number {
  return trail.ticks[slotOf(trail, i)];
}
