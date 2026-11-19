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
/** The rock block's middle rows and columns a wall picks among by its tile (the rims' quarters come from them too). */
export const CAVE_MID_TILES = 4;
/**
 * How far in from its outer edge each quarter of a side rim's stones begins (px, the middle of its pixel rows), by the
 * block's row it is read from (0: the top rim's, 1–4: the middle rows) and its upper or lower half (measured from the art,
 * the block's black left out): a spilt quarter stops bodies only where its stones are.
 */
const RIM_MARGIN: ReadonlyArray<readonly [number, number]> = [[16, 3], [4, 3], [3, 2], [2, 4], [2, 3]];

/** The block's row a wall tile's side rims are read from: the top rim's where open ground lies north of it. */
export function rimRowOf(ty: number, northOpen: boolean): number {
  return northOpen ? 0 : 1 + (ty % CAVE_MID_TILES);
}

/** How far past the wall's tile the stones of a spilt side-rim quarter stop bodies (0: not at all). */
export function caveBulgeSolid(tx: number, ty: number, side: -1 | 1, row: 0 | 1, northOpen: boolean): number {
  return Math.max(0, caveBulge(tx, ty, side, row) - RIM_MARGIN[rimRowOf(ty, northOpen)][row]);
}

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
