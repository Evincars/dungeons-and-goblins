import { TILE_HEIGHT, TILE_WIDTH, WALL_SINK } from './TileType';

/**
 * Slanted walls, at the slant the isometric castle's art is drawn at: two tiles across for every tile down (rooms'
 * corners cut off, corridors running down the slant; generators/Slants.ts). A slant crosses two tiles in each tile row
 * it passes through; the one nearer the corner it cuts off is mostly wall (`major`, three quarters of it: a Wall tile),
 * the other has only a corner of wall in it (`minor`: a Floor tile). Bodies are kept out of the wall's side of the slant
 * by pushing them back over it (so they slide along it), not by boxes, which would leave a staircase to snag on. A
 * slant with the wall below it (a south one) lets feet reach WALL_SINK past it, as a wall with floor north of it does,
 * into the wall tile under its tile too; the rim along it is drawn over whoever stands there.
 */

/** The corner of the room a slant cuts off: the wall lies that side of it. */
export const SLOPE_CORNERS = ['nw', 'ne', 'sw', 'se'] as const;
export type SlopeCorner = (typeof SLOPE_CORNERS)[number];

/** A slope tile: which corner's slant crosses it, and whether it is the mostly-wall tile of the pair. */
export type Slope = { corner: SlopeCorner; major: boolean };

/** Slopes packed as small numbers (for maps): corner index × 2, plus 1 for the major tile. */
export const SLOPE_CODES = SLOPE_CORNERS.length * 2;

export function slopeCode(slope: Slope): number {
  return SLOPE_CORNERS.indexOf(slope.corner) * 2 + (slope.major ? 1 : 0);
}

export function slopeOf(code: number): Slope {
  return { corner: SLOPE_CORNERS[code >> 1], major: (code & 1) === 1 };
}

/** The slant drops this much (down its tile row) for each pixel across: half a tile per tile. */
const SLANT = 0.5;
/** Pushing a point back over the slant: along its normal (1, 2)/√5, as a share of how far it is past the line. */
const PUSH_ACROSS = 2 / 5;
const PUSH_DOWN = 4 / 5;

const flipsX = (corner: SlopeCorner): boolean => corner === 'ne' || corner === 'se';
const flipsY = (corner: SlopeCorner): boolean => corner === 'sw' || corner === 'se';

/** Whether a slant has the wall below it (it cuts off a room's south corner, or runs under a corridor). */
export function isSouthSlope(slope: Slope): boolean {
  return flipsY(slope.corner);
}

/**
 * How far a world point is on the open side of a slope tile's slant, in pixels down the tile (negative: inside the
 * wall). Worked in the north-west corner's frame, the others mirrored onto it: there the wall is above the line
 * v = off − u/2, off being the whole tile for the major tile and half of it for the minor. A south slant's wall starts
 * WALL_SINK further in; points in the tile under it are measured against it too.
 */
export function slopeClearance(slope: Slope, tx: number, ty: number, x: number, y: number): number {
  const u = flipsX(slope.corner) ? (tx + 1) * TILE_WIDTH - x : x - tx * TILE_WIDTH;
  const v = flipsY(slope.corner) ? (ty + 1) * TILE_HEIGHT - y : y - ty * TILE_HEIGHT;
  const off = slope.major ? TILE_HEIGHT : TILE_HEIGHT / 2;
  const sink = flipsY(slope.corner) ? WALL_SINK : 0;
  return v + u * SLANT - off + sink;
}

/** Whether a world point inside a slope tile lies on the wall's side of its slant. */
export function slopeBlocks(slope: Slope, tx: number, ty: number, x: number, y: number): boolean {
  return slopeClearance(slope, tx, ty, x, y) < 0;
}

/** The corner of a body's box that reaches furthest into a slant's wall: the one facing the corner it cuts off. */
export function slopeSupport(slope: Slope, cx: number, cy: number, rx: number, ry: number, out: { x: number; y: number }): void {
  out.x = flipsX(slope.corner) ? cx + rx : cx - rx;
  out.y = flipsY(slope.corner) ? cy + ry : cy - ry;
}

/**
 * The shortest move that takes a point `depth` pixels past a slant (slopeClearance's −depth) back onto it, into `out`.
 */
export function slopePush(slope: Slope, depth: number, out: { x: number; y: number }): void {
  const across = depth * PUSH_ACROSS;
  const down = depth * PUSH_DOWN;
  out.x = flipsX(slope.corner) ? -across : across;
  out.y = flipsY(slope.corner) ? -down : down;
}
