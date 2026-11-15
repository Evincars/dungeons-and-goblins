import type { IsoRect, SlantStrip } from './IsoTiles';

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
