/**
 * The shape of the caverns' rock walls beyond their tiles, shared by what draws them (CaveTerrain.ts) and what bodies
 * bump into (Level.ts): the stones of a wall's side rims spill over the ground beside it, more in some places than
 * others, and its cliff's foot over the ground south of it. A body stops where the stones are drawn.
 */

/** How far (px) a side rim's stones spill past the wall's tile, per quarter row of it (min, max). */
const BULGE_MIN = 3;
const BULGE_MAX = 10;
/** How far below a wall's tile the stones at its cliff's foot reach (bodies stop there; the art runs a little further). */
export const CAVE_FACE_SPILL = 10;

function hash(x: number, y: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/** How far the stones of wall tile (tx, ty)'s side rim (`side` -1 west, +1 east) spill in its quarter row `row` (0, 1). */
export function caveBulge(tx: number, ty: number, side: -1 | 1, row: 0 | 1): number {
  const v = hash(tx * 4 + (side < 0 ? 0 : 2) + row, ty);
  return BULGE_MIN + (v % (BULGE_MAX - BULGE_MIN + 1));
}
