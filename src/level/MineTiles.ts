import type { IsoRect, SlantStrip } from './IsoTiles';
import { TILE_HEIGHT, TILE_WIDTH } from './TileType';

/**
 * Where the forgotten mines' terrain comes from (Theme 'mines', the cave art of /caves2): the rock faces, rims, chasm
 * cliffs and sunken pit props cut and turned onto the slant by scripts/mine-sheets.py into /caves2/mines-terrain.png
 * (keep the two in step), and the ground of g_terrain1.png. MineTerrain.ts lays them; this says which piece goes where.
 */

/** The sheets: the terrain built by scripts/mine-sheets.py, and the set's ground. */
export const MINE_WALLS = 'mine_walls';
export const MINE_GROUND = 'mine_ground';

/** A tile of the rock tops' black. */
export const MINE_VOID: IsoRect = { x: 0, y: 0, w: 32, h: 32 };

// ── Faces ─────────────────────────────────────────────────────────────────────

/**
 * A face: the bottom of the black rock top, its scalloped lip and four tiles of stone, a tile wide each (three columns
 * that run on from each other). Its foot is FACE_FOOT px down the piece; the rest is its shadow on the floor.
 */
export const FACE_H = 160;
export const FACE_FOOT = 152;
export const MINE_FACES: readonly IsoRect[] = [0, 32, 64].map((x) => ({ x, y: 32, w: 32, h: FACE_H }));
/** The rock's outline down either end of a face, standing just outside it. */
export const MINE_FACE_END_LEFT: IsoRect = { x: 96, y: 32, w: 8, h: FACE_H };
export const MINE_FACE_END_RIGHT: IsoRect = { x: 104, y: 32, w: 8, h: FACE_H };

/** A slant drops this much across a tile: a slanted strip is this much taller than the straight one it was cut from. */
const SLANT_DROP = 16;

/** The face turned onto the slant of a room's north-west and north-east corners, a tile's strip each (three of each). */
export const MINE_SLANT_FACES: Readonly<Record<'nw' | 'ne', readonly SlantStrip[]>> = {
  nw: [0, 32, 64].map((x) => ({ x, y: 200, w: 32, h: FACE_H + SLANT_DROP, footLeft: FACE_FOOT + SLANT_DROP, footRight: FACE_FOOT })),
  ne: [96, 128, 160].map((x) => ({ x, y: 200, w: 32, h: FACE_H + SLANT_DROP, footLeft: FACE_FOOT, footRight: FACE_FOOT + SLANT_DROP })),
};

// ── Rims of the rock tops ─────────────────────────────────────────────────────

/** The scalloped rim along a rock top's north edge (floor north of it), the black under it, a tile across. */
export const MINE_RIM_N: readonly IsoRect[] = [0, 32, 64].map((x) => ({ x, y: 384, w: 32, h: 32 }));
/** The rim down its west edge (floor west of it) and its east edge. */
export const MINE_RIM_W: IsoRect = { x: 96, y: 384, w: 8, h: 32 };
export const MINE_RIM_E: IsoRect = { x: 104, y: 384, w: 8, h: 32 };
/** Where its north rim meets a side's, 16 px square. */
export const MINE_RIM_NW: IsoRect = { x: 112, y: 384, w: 16, h: 16 };
export const MINE_RIM_NE: IsoRect = { x: 128, y: 384, w: 16, h: 16 };
/** The rim along a south slant (a room's south corner cut off), a tile's strip each; its top edge as in SlantStrip. */
export const MINE_RIM_SLANT: Readonly<Record<'sw' | 'se', readonly SlantStrip[]>> = {
  se: [0, 32, 64].map((x) => ({ x, y: 424, w: 32, h: 48, footLeft: SLANT_DROP, footRight: 0 })),
  sw: [96, 128, 160].map((x) => ({ x, y: 424, w: 32, h: 48, footLeft: 0, footRight: SLANT_DROP })),
};

// ── Chasms ────────────────────────────────────────────────────────────────────

/** A chasm's north edge: the floor's lip, and the dark cliff under it falling away to black over three tiles. */
export const MINE_CHASM_N: readonly IsoRect[] = [0, 32, 64].map((x) => ({ x, y: 480, w: 32, h: 96 }));
/** Its west and east rims, and the lip of the floor south of it. */
export const MINE_CHASM_W: IsoRect = { x: 96, y: 480, w: 8, h: 32 };
export const MINE_CHASM_E: IsoRect = { x: 104, y: 480, w: 8, h: 32 };
export const MINE_CHASM_LIP_S: readonly IsoRect[] = [112, 144, 176].map((x) => ({ x, y: 480, w: 32, h: 16 }));
/** Old pit props rising out of the dark of a chasm (or of the rock below a room's south edge), fading into it. */
export const MINE_SUNKEN_POSTS: readonly IsoRect[] = [224, 256, 288, 320].map((x) => ({ x, y: 480, w: 32, h: 176 }));

// ── Ground (g_terrain1.png) ───────────────────────────────────────────────────

/** The ground tones: brown earth, grey-green clay, slate and rust (FloorZone.tone indexes them). */
export const MINE_FLOOR_TONES = 4;
/** Each tone's seamless 128 px block, laid by tile position so it runs on. */
export const MINE_GROUND_BLOCKS: readonly IsoRect[] = [
  { x: 384, y: 0, w: 128, h: 128 }, { x: 384, y: 128, w: 128, h: 128 }, { x: 384, y: 256, w: 128, h: 128 }, { x: 896, y: 0, w: 128, h: 128 },
];

// ── Holes in the floor (other_decoratives.png) ────────────────────────────────

/** The sheet the holes are cut from. */
export const MINE_DECOR = 'mine_decor';

/** A box of a hole's open dark, in px from its art's top-left. */
type OpenBox = readonly [number, number, number, number];

/**
 * A hole in a mine's floor (a Pit of shape 'hole', its `lobes` saying which): its art, centred on the `w`×`h` Hole tiles
 * it is dug on, and its open dark as boxes round the black of its art (feet over them fall in), from small ones a body's
 * size to great ragged ones.
 */
export type MineHole = { art: IsoRect; w: number; h: number; open: readonly OpenBox[] };

/** The other way round: a hole's art drawn the other way, and its open dark mirrored with it. */
const mirrored = (open: readonly OpenBox[], w: number): OpenBox[] => open.map(([x0, y0, x1, y1]) => [w - x1, y0, w - x0, y1]);

const GREAT_OPEN: readonly OpenBox[] = [[18, 3, 35, 14], [20, 14, 68, 28], [22, 28, 48, 35], [7, 35, 38, 48], [8, 48, 22, 53]];
const WIDE_OPEN: readonly OpenBox[] = [[4, 3, 23, 14], [7, 14, 55, 27], [19, 27, 40, 34]];

export const MINE_HOLES: readonly MineHole[] = [
  { art: { x: 546, y: 40, w: 26, h: 18 }, w: 1, h: 1, open: [[7, 2, 21, 14]] },
  { art: { x: 512, y: 70, w: 30, h: 19 }, w: 1, h: 1, open: [[7, 2, 25, 15]] },
  { art: { x: 452, y: 232, w: 26, h: 18 }, w: 1, h: 1, open: [[5, 2, 19, 14]] },
  { art: { x: 482, y: 262, w: 30, h: 19 }, w: 1, h: 1, open: [[5, 2, 23, 15]] },
  { art: { x: 521, y: 97, w: 45, h: 28 }, w: 2, h: 1, open: [[3, 3, 23, 10], [6, 10, 36, 20]] },
  { art: { x: 458, y: 289, w: 45, h: 28 }, w: 2, h: 1, open: [[22, 3, 42, 10], [9, 10, 39, 20]] },
  { art: { x: 470, y: 139, w: 65, h: 42 }, w: 2, h: 2, open: WIDE_OPEN },
  { art: { x: 489, y: 331, w: 65, h: 42 }, w: 2, h: 2, open: mirrored(WIDE_OPEN, 65) },
  { art: { x: 449, y: 1, w: 77, h: 63 }, w: 3, h: 2, open: GREAT_OPEN },
  { art: { x: 498, y: 193, w: 77, h: 63 }, w: 3, h: 2, open: mirrored(GREAT_OPEN, 77) },
];

/** Where a hole's art is drawn on its tiles: centred on them (in px from their top-left). */
export function holeArtOffset(hole: MineHole): { x: number; y: number } {
  return { x: Math.floor((hole.w * TILE_WIDTH - hole.art.w) / 2), y: Math.floor((hole.h * TILE_HEIGHT - hole.art.h) / 2) };
}
