import type { SpellDef } from './Spells';

/** What the area's shape needs of a spell (a class feature with an area, Create Water, gives the same). */
export type AreaShape = Pick<SpellDef, 'area' | 'range' | 'radius'>;

/**
 * Where a burst strikes, the same for the heroes' spells (systems/SpellSystem.ts), the enemies' (systems/EnemyRangedSystem.ts)
 * and the aim guide that shows it (systems/AimGuideSystem.ts). A sphere or a cube goes off at the point aimed at, no further
 * from the caster than the spell's range (on the caster for a range of 0): aimed past it, it goes off as far that way as it
 * reaches. A cone always runs its whole length from the caster towards the aim; its "centre" is its tip.
 */

/** A cone is as wide at any distance as it is far out (the tabletop's cone): half that each side of its axis. */
const CONE_SPREAD = 0.5;
/** Square root of two: how far a cube's corner lies from its middle, in radii. */
const CUBE_CORNER = Math.SQRT2;

export type Point = { x: number; y: number };

/** Which way a cone cast at its own caster faces. */
const DOWN: Point = { x: 0, y: 1 };

/** How far a cone reaches from the caster's hands. */
export function coneLength(def: AreaShape): number {
  return def.range + def.radius;
}

/**
 * Where a burst cast from `from` at `target` goes off (written into `out`): a sphere or cube at the target, as far towards
 * it as it reaches; a cone's tip, its whole length towards it (`facing`, a unit vector, when the target is the caster).
 */
export function areaCentre(def: AreaShape, from: Point, target: Point, out: Point, facing: Point = DOWN): Point {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const dist = Math.hypot(dx, dy);
  const ux = dist > 0 ? dx / dist : facing.x;
  const uy = dist > 0 ? dy / dist : facing.y;
  const reach = def.area === 'cone' ? coneLength(def) : Math.min(dist, def.range);
  out.x = from.x + ux * reach;
  out.y = from.y + uy * reach;
  return out;
}

/** Whether (x, y), with a body `pad` px round it, is caught by a burst cast from `from` going off at `centre` (areaCentre). */
export function inArea(def: AreaShape, from: Point, centre: Point, x: number, y: number, pad = 0): boolean {
  if (def.area === 'cube') return Math.abs(x - centre.x) <= def.radius + pad && Math.abs(y - centre.y) <= def.radius + pad;
  if (def.area === 'sphere') return Math.hypot(x - centre.x, y - centre.y) <= def.radius + pad;
  const length = coneLength(def);
  const ux = (centre.x - from.x) / length;
  const uy = (centre.y - from.y) / length;
  const along = (x - from.x) * ux + (y - from.y) * uy;
  if (along < -pad || along > length + pad) return false;
  const across = Math.abs((x - from.x) * uy - (y - from.y) * ux);
  return across <= Math.max(0, along) * CONE_SPREAD + pad;
}

/** A circle round everything a burst may catch (written into `out` as x, y and r), to ask the spatial index with. */
export function areaBounds(def: AreaShape, from: Point, centre: Point, out: Point & { r: number }): Point & { r: number } {
  if (def.area === 'cone') {
    out.x = (from.x + centre.x) / 2;
    out.y = (from.y + centre.y) / 2;
    out.r = coneLength(def) * Math.hypot(0.5, CONE_SPREAD);
    return out;
  }
  out.x = centre.x;
  out.y = centre.y;
  out.r = def.area === 'cube' ? def.radius * CUBE_CORNER : def.radius;
  return out;
}

/** The three corners of a cone as drawn on the map: the caster's hands, and either end of its far edge. */
export function coneCorners(def: AreaShape, from: Point, centre: Point, out: [Point, Point, Point]): [Point, Point, Point] {
  const length = coneLength(def);
  const half = length * CONE_SPREAD;
  const ux = (centre.x - from.x) / length;
  const uy = (centre.y - from.y) / length;
  out[0].x = from.x;
  out[0].y = from.y;
  out[1].x = centre.x - uy * half;
  out[1].y = centre.y + ux * half;
  out[2].x = centre.x + uy * half;
  out[2].y = centre.y - ux * half;
  return out;
}
