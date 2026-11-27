import { world } from '../../world';
import { withinCloseQuarters } from '../../rules/CloseQuarters';

/**
 * Heavily obscured ground (Fog Cloud, systems/FogCloud.ts): nobody sees into it, out of it or through it. A creature in it
 * is effectively blinded and unseen, so attacks into it, out of it and within it are at disadvantage (systems/Strike.ts), and
 * enemies lose sight of a hero in it or behind it — except one within 5 feet, close enough to hear and feel.
 */

const fogs = world.with('fogCloud', 'position');

/** Whether (x, y) lies inside a fog cloud. */
export function inFog(x: number, y: number): boolean {
  for (const fog of fogs) {
    if (!fog.removed && Math.hypot(x - fog.position.x, y - fog.position.y) <= fog.fogCloud.radius) return true;
  }
  return false;
}

/** How far a point lies from the segment (ax, ay)–(bx, by). */
function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const length2 = dx * dx + dy * dy;
  const t = length2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length2)) : 0;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

/** Whether a fog cloud lies on the line between two points (either end in it, or the line through it). */
export function fogBetween(ax: number, ay: number, bx: number, by: number): boolean {
  for (const fog of fogs) {
    if (fog.removed) continue;
    if (distanceToSegment(fog.position.x, fog.position.y, ax, ay, bx, by) <= fog.fogCloud.radius) return true;
  }
  return false;
}

/** Whether fog keeps one from seeing the other: fog between them, unless they stand within 5 feet of each other. */
export function sightObscured(ax: number, ay: number, bx: number, by: number): boolean {
  return !withinCloseQuarters(ax, ay, bx, by) && fogBetween(ax, ay, bx, by);
}
