import { world } from '../world';
import type { Level } from '../level/Level';
import { recordTrail } from '../ai/perception/trail';

const walkers = world.with('position', 'trail');

/** Players drop a trail crumb on every tile they step onto, for enemies that lost sight of them to follow. */
export function updateTrails(level: Level, tick: number): void {
  for (const walker of walkers) {
    if (walker.respawnTicks !== undefined || walker.falling) continue;
    recordTrail(level, walker.trail, walker.position.x, walker.position.y, tick);
  }
}
