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

// ── Rock tops ─────────────────────────────────────────────────────────────────

/**
 * The rock tops' dark: the faint cobbles of the set's block tops, repeating every tile with no seam, laid out two tiles
 * square so a tile's window of it can be cut at any offset (MineTerrain.ts cuts it by world position, so every piece of
 * it, whatever lies over or under it, runs on).
 */
export const MINE_FILL: IsoRect = { x: 0, y: 0, w: 64, h: 64 };
/** How deep the scalloped rim is, and how far in from its edge the dark under it starts. */
export const RIM_DEPTH = 16;
export const RIM_INSET = 8;
/** The rim along a rock top's north edge (floor north of it): rings of stone over the dark, a tile across, three that run on. */
export const MINE_RIM_N: readonly IsoRect[] = [128, 160, 192].map((x) => ({ x, y: 0, w: 32, h: RIM_DEPTH }));
/**
 * The same rim turned to run down a rock top's west edge (floor west of it) and its east edge, a tile down each. Turned
 * from the north rim, the west strips run on upward (row ty takes strip (3 - ty % 3) % 3), the east ones downward.
 */
export const MINE_RIM_W: readonly IsoRect[] = [224, 240, 256].map((x) => ({ x, y: 0, w: RIM_DEPTH, h: 32 }));
export const MINE_RIM_E: readonly IsoRect[] = [272, 288, 304].map((x) => ({ x, y: 0, w: RIM_DEPTH, h: 32 }));
/** One ring of the rim, cut round: laid where two runs of rim meet at a corner, so it turns round instead of squaring off. */
export const MINE_KNOT: IsoRect = { x: 64, y: 0, w: 14, h: 14 };

// ── Faces ─────────────────────────────────────────────────────────────────────

/**
 * A face: the bottom of the black rock top, its scalloped lip and four tiles of stone, a tile wide each (three columns
 * that run on from each other). Its foot is FACE_FOOT px down the piece; the rest is its shadow on the floor.
 */
export const FACE_H = 160;
export const FACE_FOOT = 152;
export const FACE_SHADOW = FACE_H - FACE_FOOT;
/** A face reaches over its foot row and this many rows above it, when the rock is that deep. */
export const FACE_ROWS = 5;
/** A face cut short (rock thinner than FACE_ROWS) starts this far below the top of its highest row, under the rim drawn there. */
export const CUT_UNDER_RIM = 16;
export const MINE_FACES: readonly IsoRect[] = [0, 32, 64].map((x) => ({ x, y: 64, w: 32, h: FACE_H }));
/** The rock's outline down either end of a face, drawn over the face's end column. */
export const MINE_FACE_END_LEFT: IsoRect = { x: 96, y: 64, w: 8, h: FACE_H };
export const MINE_FACE_END_RIGHT: IsoRect = { x: 104, y: 64, w: 8, h: FACE_H };

/** How tall a face cut short over `rows` rows of rock is: from under the rim of its highest row down past its foot. */
export function cutFaceHeight(rows: number): number {
  return rows * TILE_HEIGHT - CUT_UNDER_RIM + FACE_SHADOW;
}

/** The cuts made, by rows of rock (1 up to FACE_ROWS - 1). */
const CUT_ROWS = [1, 2, 3, 4] as const;

/**
 * Faces cut short, by rows of rock less one (each the three columns): the face's lip kept over its lowest stones, so the
 * rock's edge shows at its top however few rows it stands over.
 */
export const MINE_CUT_FACES: readonly (readonly IsoRect[])[] = CUT_ROWS.map((rows, k) =>
  [0, 1, 2].map((i) => ({ x: 112 + (k * 3 + i) * 32, y: 64, w: 32, h: cutFaceHeight(rows) })),
);

/** A slant drops this much across a tile: a slanted strip is this much taller than the straight one it was cut from. */
const SLANT_DROP = 16;

/** A face of height h turned onto the slant of a north-west or north-east corner, its foot along its bottom. */
function slantStrip(x: number, y: number, h: number, corner: 'nw' | 'ne'): SlantStrip {
  const foot = h - FACE_SHADOW;
  return corner === 'nw'
    ? { x, y, w: 32, h: h + SLANT_DROP, footLeft: foot + SLANT_DROP, footRight: foot }
    : { x, y, w: 32, h: h + SLANT_DROP, footLeft: foot, footRight: foot + SLANT_DROP };
}

/** The face turned onto the slant of a room's north-west and north-east corners, a tile's strip each (three of each). */
export const MINE_SLANT_FACES: Readonly<Record<'nw' | 'ne', readonly SlantStrip[]>> = {
  nw: [0, 1, 2].map((i) => slantStrip(i * 32, 232, FACE_H, 'nw')),
  ne: [0, 1, 2].map((i) => slantStrip((3 + i) * 32, 232, FACE_H, 'ne')),
};

/** Slanted faces cut short, as MINE_CUT_FACES are. */
export const MINE_CUT_SLANT_FACES: readonly Readonly<Record<'nw' | 'ne', readonly SlantStrip[]>>[] = CUT_ROWS.map((rows, k) => ({
  nw: [0, 1, 2].map((i) => slantStrip(192 + (k * 6 + i) * 32, 232, cutFaceHeight(rows), 'nw')),
  ne: [0, 1, 2].map((i) => slantStrip(192 + (k * 6 + 3 + i) * 32, 232, cutFaceHeight(rows), 'ne')),
}));

/** The rim along a south slant (a room's south corner cut off), the rock's dark under it, a tile's strip each. */
export const MINE_RIM_SLANT: Readonly<Record<'sw' | 'se', readonly SlantStrip[]>> = {
  se: [0, 32, 64].map((x) => ({ x, y: 416, w: 32, h: 48, footLeft: SLANT_DROP, footRight: 0 })),
  sw: [96, 128, 160].map((x) => ({ x, y: 416, w: 32, h: 48, footLeft: 0, footRight: SLANT_DROP })),
};

// ── Chasms ────────────────────────────────────────────────────────────────────

/** Dark thorns stand this far up over the floor along a chasm's north brink. */
export const THORN_H = 10;
/** A chasm's cliff falls over this many rows (fading out over the last of them), cut short where the chasm is shallower. */
export const CLIFF_ROWS = 3;
/** Which side of a cliff fades out (no cliff runs on beside it there): MINE_CLIFFS is indexed by it. */
export const CLIFF_FADES = ['none', 'left', 'right', 'both'] as const;
export type CliffFade = (typeof CLIFF_FADES)[number];
/**
 * A chasm's north brink and the cliff under it, whole or fading out at one side or both (CLIFF_FADES), each the three
 * columns: the floor's pebbles and the thorns over it, and the grey-blue cobbles fading into the dark below.
 */
export const MINE_CLIFFS: readonly (readonly IsoRect[])[] = CLIFF_FADES.map((_, k) =>
  [0, 1, 2].map((i) => ({ x: (k * 3 + i) * 32, y: 480, w: 32, h: THORN_H + CLIFF_ROWS * TILE_HEIGHT })),
);
/** The pebbles down a chasm's west and east brinks (floor beside it), a tile down each; their line lies BRINK_LINE px in. */
export const MINE_BRINK_W: readonly IsoRect[] = [384, 400, 416].map((x) => ({ x, y: 480, w: 16, h: 32 }));
export const MINE_BRINK_E: readonly IsoRect[] = [432, 448, 464].map((x) => ({ x, y: 480, w: 16, h: 32 }));
export const BRINK_LINE = 6;
/** The pebbles along a chasm's south brink (floor south of it), a tile across each; their line lies BRINK_LINE px down. */
export const MINE_BRINK_S: readonly IsoRect[] = [480, 512, 544].map((x) => ({ x, y: 480, w: 32, h: 12 }));
/** Knots of pebbles, laid centred where two brinks meet at a corner. */
export const MINE_BRINK_KNOTS: readonly IsoRect[] = [576, 592, 608].map((x) => ({ x, y: 480, w: 16, h: 16 }));
/** Old pit props rising out of the dark of a chasm, fading into it. */
export const MINE_SUNKEN_POSTS: readonly IsoRect[] = [640, 672, 704, 736].map((x) => ({ x, y: 480, w: 32, h: 176 }));

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
