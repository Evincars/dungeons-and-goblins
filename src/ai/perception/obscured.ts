import { world, q } from '../../world';
import { feetToPx } from '../../rules/Scale';
import type { Entity } from '../../world';
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

/** Whether (x, y) lies inside magical darkness (Darkness): no light shines there. */
export function inDarkness(x: number, y: number): boolean {
  for (const fog of fogs) {
    if (fog.fogCloud.dark && !fog.removed && Math.hypot(x - fog.position.x, y - fog.position.y) <= fog.fogCloud.radius) return true;
  }
  return false;
}

/** Every hero carries a torch: bright light this far round them (20 feet); a glowing thing lights brightly half its reach. */
const TORCH_BRIGHT = feetToPx(20);
const GLOW_BRIGHT_SHARE = 0.5;

/**
 * Whether (x, y) lies in dim light or darkness (Shadow Blade strikes there at advantage): in magical darkness, or out of the
 * bright light of every hero's torch and every glowing thing (a campfire, a lantern, a fire on the floor, a light spell).
 */
export function inDimLight(x: number, y: number): boolean {
  if (inDarkness(x, y)) return true;
  for (const hero of q.players) {
    if (hero.health.current > 0 && Math.hypot(hero.position.x - x, hero.position.y - y) <= TORCH_BRIGHT) return false;
  }
  for (const light of q.glowing) {
    if (Math.hypot(light.position.x - x, light.position.y - y) <= light.glow.radius * GLOW_BRIGHT_SHARE) return false;
  }
  return true;
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

/** Whether a body sees the invisible (See Invisibility, a diviner's Third Eye; systems/Invisibility.ts casts them). */
function seesTheInvisible(body: Entity): boolean {
  return (body.seesInvisible ?? 0) > 0 || !!body.arcana?.seeInvisible;
}

/**
 * Whether magic keeps the viewer from seeing the target: the viewer blinded (Blindness, systems/SpellHolds.ts), or the target
 * invisible to it (Invisibility) — unless they stand within 5 feet of each other, close enough to hear and feel.
 */
export function unseenBy(viewer: Entity, target: Entity): boolean {
  const blind = (viewer.spellHolds?.blinded?.ticks ?? 0) > 0;
  const hidden = !!target.invisible && !seesTheInvisible(viewer);
  if (!blind && !hidden) return false;
  const a = viewer.position;
  const b = target.position;
  return !a || !b || !withinCloseQuarters(a.x, a.y, b.x, b.y);
}
