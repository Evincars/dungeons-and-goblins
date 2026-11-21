import type { SpellDef } from './Spells';

/** What the area's shape needs of a spell (a class feature with an area, Create Water, gives the same). */
export type AreaShape = Pick<SpellDef, 'area' | 'range' | 'radius'>;

/**
 * Where a burst strikes, the same for the heroes' spells (systems/SpellSystem.ts), the enemies' (systems/EnemyRangedSystem.ts)
 * and the aim guide that shows it (systems/AimGuideSystem.ts). A sphere or a cube goes off at the point aimed at, no further
 * from the caster than the spell's range (on the caster for a range of 0): aimed past it, it goes off as far that way as it
 * reaches. A cone or a line (Lightning Bolt) always runs its whole length from the caster towards the aim; its "centre" is
 * its far end. A line is `range` long and `radius` wide each side of it.
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

/** Whether the area runs out of the caster's hands towards the aim (a cone, a line) rather than going off at a point. */
export function fromHands(def: AreaShape): boolean {
  return def.area === 'cone' || def.area === 'line';
}

/** How far a cone or a line runs from the caster's hands. */
export function handsLength(def: AreaShape): number {
  return def.area === 'line' ? def.range : coneLength(def);
}

/** How far from the caster the area may catch someone: a line's length, else its range and its breadth beyond it. */
export function areaReach(def: AreaShape): number {
  return def.area === 'line' ? def.range : def.range + def.radius;
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
  const reach = fromHands(def) ? handsLength(def) : Math.min(dist, def.range);
  out.x = from.x + ux * reach;
  out.y = from.y + uy * reach;
  return out;
}

/** Whether (x, y), with a body `pad` px round it, is caught by a burst cast from `from` going off at `centre` (areaCentre). */
export function inArea(def: AreaShape, from: Point, centre: Point, x: number, y: number, pad = 0): boolean {
  if (def.area === 'cube') return Math.abs(x - centre.x) <= def.radius + pad && Math.abs(y - centre.y) <= def.radius + pad;
  if (def.area === 'sphere') return Math.hypot(x - centre.x, y - centre.y) <= def.radius + pad;
  const length = handsLength(def);
  const ux = (centre.x - from.x) / length;
  const uy = (centre.y - from.y) / length;
  const along = (x - from.x) * ux + (y - from.y) * uy;
  if (along < -pad || along > length + pad) return false;
  const across = Math.abs((x - from.x) * uy - (y - from.y) * ux);
  const halfWidth = def.area === 'line' ? def.radius : Math.max(0, along) * CONE_SPREAD;
  return across <= halfWidth + pad;
}

/** A circle round everything a burst may catch (written into `out` as x, y and r), to ask the spatial index with. */
export function areaBounds(def: AreaShape, from: Point, centre: Point, out: Point & { r: number }): Point & { r: number } {
  if (fromHands(def)) {
    out.x = (from.x + centre.x) / 2;
    out.y = (from.y + centre.y) / 2;
    const length = handsLength(def);
    out.r = def.area === 'line' ? Math.hypot(length / 2, def.radius) : length * Math.hypot(0.5, CONE_SPREAD);
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

/** The four corners of a line as drawn on the map: either side of the caster's hands, then either side of its far end. */
export function lineCorners(def: AreaShape, from: Point, centre: Point, out: [Point, Point, Point, Point]): [Point, Point, Point, Point] {
  const length = handsLength(def);
  const sx = -((centre.y - from.y) / length) * def.radius;
  const sy = ((centre.x - from.x) / length) * def.radius;
  out[0].x = from.x + sx;
  out[0].y = from.y + sy;
  out[1].x = centre.x + sx;
  out[1].y = centre.y + sy;
  out[2].x = centre.x - sx;
  out[2].y = centre.y - sy;
  out[3].x = from.x - sx;
  out[3].y = from.y - sy;
  return out;
}
