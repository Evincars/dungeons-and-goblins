import type { WallDecor } from './Level';
import type { SlopeCorner } from './Slopes';

/**
 * Where the isometric castle's terrain comes from in /castle-izometric, measured from the art. Its walls are seen from
 * the south at a slant: a wall with floor south of it shows its whole face (64 px of stone under a cap), a wall cutting
 * a room's corner shows its face on the slant (two tiles across for each tile down), and every other edge of the dark
 * (the wall tops, chasms) is outlined with a stone rim. IsoTerrain.ts lays them; this says which piece goes where.
 */

/** The sheets: walls, faces, rims of the wall tops, stairs and wall decor; floors, chasm rims and sunken columns. */
export const ISO_WALLS = 'iso_walls';
export const ISO_FLOORS = 'iso_floors';

export type IsoRect = { readonly x: number; readonly y: number; readonly w: number; readonly h: number };

/** A tile of plain black (the square at the sheet's top left): the dark of a wall top, laid over whoever is behind it. */
export const ISO_VOID: IsoRect = { x: 16, y: 16, w: 32, h: 32 };

// ── Faces (mainlevbuild1) ─────────────────────────────────────────────────────

/** A face is two tiles tall: cap molding over stone, from this row of the long north wall at the top of the sheet. */
export const FACE_Y = 16;
export const FACE_H = 64;
/** Plain stretches of that wall, a tile wide each (the first two and the last two run on from each other). */
export const FACE_XS = [176, 208, 256, 288] as const;
/** The pilaster standing proud of the wall (it reaches a little below the face's foot). */
export const FACE_PILASTER: IsoRect = { x: 240, y: 16, w: 16, h: 68 };
/** The narrow columns of small stones that end the long wall at its left and right. */
export const FACE_END_LEFT: IsoRect = { x: 160, y: 16, w: 16, h: 64 };
export const FACE_END_RIGHT: IsoRect = { x: 320, y: 16, w: 16, h: 64 };

/**
 * A slanted face, one tile across: the strip cut from the free-standing slanted walls at the sheet's sides. Its foot
 * runs down the slant: `footLeft` and `footRight` are how far down the strip its foot is at its left and right edges.
 */
export type SlantStrip = IsoRect & { footLeft: number; footRight: number };
export const SLANT_FACE: Readonly<Record<'nw' | 'ne', SlantStrip>> = {
  nw: { x: 0, y: 80, w: 32, h: 80, footLeft: 80, footRight: 64 },
  ne: { x: 464, y: 80, w: 32, h: 80, footLeft: 64, footRight: 80 },
};

// ── Rims of the wall tops (mainlevbuild1: the framed block under the long walls) ──

/** The rim along a wall top's north edge (floor north of it), with the dark under it, a tile across. */
export const WALL_RIM_N: IsoRect[] = [176, 208, 240, 272].map((x) => ({ x, y: 480, w: 32, h: 32 }));
/** The rim down a wall top's west edge (floor west of it) and its east edge (floor east of it). */
export const WALL_RIM_W: IsoRect = { x: 112, y: 520, w: 8, h: 32 };
export const WALL_RIM_E: IsoRect = { x: 376, y: 520, w: 8, h: 32 };
/** Where a wall top's north rim meets its west or east rim (the top corners of the block), 16 px square. */
export const WALL_RIM_NW: IsoRect = { x: 112, y: 464, w: 16, h: 16 };
export const WALL_RIM_NE: IsoRect = { x: 368, y: 464, w: 16, h: 16 };
/** A wall top touched by floor only at a corner: the nub where the two rims round it meet. */
export const WALL_NUB_NW: IsoRect = { x: 160, y: 528, w: 16, h: 16 };
export const WALL_NUB_NE: IsoRect = { x: 304, y: 528, w: 16, h: 16 };
/**
 * The rim along a slant with the floor above it (a room's south corners cut off): one tile across of the block's slanted
 * top corners, the dark under it. Its rim's top edge is `footLeft`/`footRight` down the strip at its left and right.
 */
export const WALL_RIM_SLANT: Readonly<Record<'sw' | 'se', SlantStrip>> = {
  se: { x: 144, y: 480, w: 32, h: 32, footLeft: 16, footRight: 0 },
  sw: { x: 320, y: 480, w: 32, h: 32, footLeft: 0, footRight: 16 },
};

// ── Chasms (mainlevbuild2: the great pit) ─────────────────────────────────────

/** A chasm's north rim (floor north of it) with the dark stone of its far side under it, a tile across. */
export const CHASM_RIM_N: IsoRect[] = [544, 576, 608, 640].map((x) => ({ x, y: 624, w: 32, h: 32 }));
/** Its south lip (floor south of it): the floor's edge seen from above, at the bottom of the chasm tile. */
export const CHASM_LIP_S: IsoRect[] = [544, 576, 608, 640].map((x) => ({ x, y: 928, w: 32, h: 16 }));
/** Its west and east rims (floor west or east of it). */
export const CHASM_RIM_W: IsoRect = { x: 416, y: 736, w: 8, h: 32 };
export const CHASM_RIM_E: IsoRect = { x: 792, y: 736, w: 8, h: 32 };
/**
 * Columns sinking into the dark, their pointed tops catching the light: under a rim with deep dark below (a chasm, or
 * the wall tops south of a room) holding up the floor's edge, or standing on their own out in the dark.
 */
export const SUNKEN_COLUMNS: IsoRect[] = [832, 880, 936, 984].map((x) => ({ x, y: 624, w: 32, h: 112 }));

// ── Floors (mainlevbuild2) ────────────────────────────────────────────────────

/**
 * The floor tones: dark slate, oxblood and teal, each a seamless block of diamond slabs laid by tile position so its
 * pattern runs on (FloorZone.tone indexes them).
 */
export const FLOOR_BLOCKS: IsoRect[] = [16, 384, 704].map((x) => ({ x, y: 16, w: 256, h: 128 }));

// ── Stairs (mainlevbuild1: the U-shaped block at 848, 512) ────────────────────

/**
 * Its middle: four steps a tile tall, laid across a north–south corridor (the 64 px middle of the 80 px flight, its
 * ends being hidden under the corridor's rims).
 */
export const STEPS: IsoRect = { x: 888, y: 592, w: 64, h: 32 };

// ── Wall decor (mainlevbuild1) ────────────────────────────────────────────────

/**
 * The decor set into a face: on the straight faces (`front`, centred on its `span` tiles, its foot `lift` px above the
 * floor) or on a slanted face (`slant`, its foot following the slant, starting at the decor's first column).
 */
export type IsoDecorArt = IsoRect & { span: number; lift: number; slant?: SlopeCorner };

export const ISO_DECOR = {
  isoWindow:  { x: 197, y: 816, w: 38, h: 52, span: 1, lift: 6 },
  isoWindow2: { x: 373, y: 816, w: 38, h: 52, span: 1, lift: 6 },
  isoStatue:  { x: 197, y: 880, w: 38, h: 52, span: 1, lift: 6 },
  isoStatue2: { x: 373, y: 880, w: 38, h: 52, span: 1, lift: 6 },
  isoShelf:   { x: 112, y: 928, w: 32, h: 48, span: 1, lift: 2 },
  isoCrystal: { x: 20, y: 885, w: 74, h: 94, span: 2, lift: 4 },
  isoDoor:    { x: 928, y: 672, w: 80, h: 108, span: 2, lift: 0 },
  isoWindowNW:  { x: 249, y: 817, w: 32, h: 58, span: 1, lift: 3, slant: 'nw' },
  isoStatueNW:  { x: 249, y: 881, w: 32, h: 58, span: 1, lift: 3, slant: 'nw' },
  isoMirrorNW:  { x: 231, y: 945, w: 64, h: 72, span: 2, lift: 1, slant: 'nw' },
  isoCrystalNW: { x: 16, y: 744, w: 64, h: 106, span: 2, lift: 1, slant: 'nw' },
  isoGroupNW:   { x: 144, y: 681, w: 128, h: 106, span: 4, lift: 1, slant: 'nw' },
  isoWindowNE:  { x: 327, y: 817, w: 32, h: 58, span: 1, lift: 3, slant: 'ne' },
  isoStatueNE:  { x: 327, y: 881, w: 32, h: 58, span: 1, lift: 3, slant: 'ne' },
  isoMirrorNE:  { x: 313, y: 945, w: 64, h: 72, span: 2, lift: 1, slant: 'ne' },
  isoCrystalNE: { x: 544, y: 744, w: 64, h: 106, span: 2, lift: 1, slant: 'ne' },
  isoGroupNE:   { x: 352, y: 681, w: 128, h: 106, span: 4, lift: 1, slant: 'ne' },
} as const satisfies Record<string, IsoDecorArt>;
export type IsoDecor = keyof typeof ISO_DECOR;

export function isIsoDecor(decor: WallDecor): decor is WallDecor & IsoDecor {
  return decor in ISO_DECOR;
}

/** The front decor for straight faces, one tile wide (the rest are picked on purpose: shelves, crystals, doors). */
export const FRONT_DECOR_SMALL = ['isoWindow', 'isoWindow2', 'isoStatue', 'isoStatue2'] as const satisfies readonly IsoDecor[];
/** The decor of a slanted face, by its corner, by how many tiles of slant it needs. */
export const SLANT_DECOR = {
  nw: ['isoWindowNW', 'isoStatueNW', 'isoMirrorNW', 'isoCrystalNW', 'isoGroupNW'],
  ne: ['isoWindowNE', 'isoStatueNE', 'isoMirrorNE', 'isoCrystalNE', 'isoGroupNE'],
} as const satisfies Record<'nw' | 'ne', readonly IsoDecor[]>;
