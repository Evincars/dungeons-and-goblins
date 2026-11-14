import type { Level, WallDecor } from './Level';
import { POOL_H, POOL_W } from './Level';
import type { PoolKind } from './Level';
import { TILE_HEIGHT, TILE_WIDTH } from './TileType';

/**
 * Where a castle's terrain comes from in its tileset (/castle/mainlevbuild.png), measured from the art: the same
 * scheme as the catacombs' tileset (a framed block of wall-top void over a south face, cap molding over three rows of
 * stone, a plinth at its foot) at other coordinates, and the castle's own pieces — tall pilasters standing proud of the
 * cap, narrow and great gothic windows, an arched door, an ornate face, the great arch over a passage, its floors, its
 * pools and its spike pit. TerrainAutotile.ts lays them; this says which piece goes where.
 */

export type Src = readonly [number, number];

/** The framed block's quarters: wall-top outline corners and edges, and the void inside. */
export const CASTLE_TOP = {
  outerTL: [96, 0], outerTR: [248, 0], edgeTopL: [112, 0], edgeTopR: [120, 0],
  edgeLeft: [[96, 16], [96, 24]], edgeRight: [[248, 16], [248, 24]], void: [160, 48],
} as const;

/** The face under the block: the cap row, then its stone rows from the foot up (k = 1, 2, 3), and the plinth. */
const CAP_Y = 112;
const ROW_Y = [160, 144, 128];
const PLINTH_Y = 176;
const LEFT_X = 96;
const RIGHT_X = 240;
/** Plain stone columns of the face (between its pilasters), picked by sub-tile column. */
const MID_X = [112, 128, 160, 176, 208, 224];
/** A tall pilaster (16 wide): its top pokes a sub-tile above the cap, its base is a full sub-tile on the floor. */
const PILASTER_X = 48;
const PILASTER_TOP_Y = 96;
/** Narrow stained-glass windows, two sub-tiles wide, on the face's rows. */
const WINDOW_X = [0, 320];
/**
 * Arrow slits, one sub-tile wide and two rows tall (a dark slit under its lintel, or a crack in the stone), on the
 * face's lower two rows; the third row and the cap above them are plain.
 */
const SLIT_X = [0, 336];
const SLIT_Y = [64, 48];

/**
 * The decorated stretches of face, each a run of whole tiles: [first x in the tileset, cap y, stone rows y from the
 * foot up]. The door and dark window are 2 tiles wide, the ornate face 4 and the great gothic window 3 (its gable
 * rises two sub-tiles above the cap, GOTHIC_GABLE_Y).
 */
const DECOR_ART = {
  door: { x: 32, cap: 16, rows: [64, 48, 32] },
  glass: { x: 256, cap: 16, rows: [64, 48, 32] },
  ornate: { x: 368, cap: 0, rows: [48, 32, 16] },
  gothic: { x: 416, cap: 112, rows: [160, 144, 128] },
} as const;
const GOTHIC_GABLE_Y = [80, 96];

/** The decorated stretches the builder can put on a castle face, and how many tiles each takes. */
export const CASTLE_FACE_DECOR = { door: 2, glass: 2, ornate: 4, gothic: 3 } as const;
export type CastleFaceDecor = keyof typeof CASTLE_FACE_DECOR;

/** The art of one decorated tile: its stretch and which of its tiles it is (`gothic1`: the middle of a great window). */
function decorParts(decor: WallDecor): { art: (typeof DECOR_ART)[CastleFaceDecor]; index: number } | null {
  const match = /^(door|glass|ornate|gothic)(\d)$/.exec(decor);
  if (!match) return null;
  const kind = match[1];
  if (kind !== 'door' && kind !== 'glass' && kind !== 'ornate' && kind !== 'gothic') return null;
  return { art: DECOR_ART[kind], index: Number(match[2]) };
}

export type CastleFaceStyle = 'left' | 'right' | 'mid' | 'pillarL' | 'pillarR' | 'window' | 'slit' | 'decor';

/** The piece one face sub-tile shows: k counts its row from the face's foot (1 = lowest); `cap` is the top row. */
export function castleFaceSource(style: CastleFaceStyle, sx: number, k: number, cap: boolean, decor: WallDecor | undefined, variant: number): Src {
  const row = cap ? CAP_Y : ROW_Y[k - 1];
  const parts = style === 'decor' && decor ? decorParts(decor) : null;
  if (parts) return [parts.art.x + (parts.index * 2 + (sx & 1)) * 16, cap ? parts.art.cap : parts.art.rows[k - 1]];
  switch (style) {
    case 'left': return [LEFT_X, row];
    case 'right': return [RIGHT_X, row];
    case 'pillarL': return [PILASTER_X, row];
    case 'window': return [WINDOW_X[variant % WINDOW_X.length] + (sx & 1) * 16, row];
    case 'slit': return !cap && k <= SLIT_Y.length ? [SLIT_X[variant % SLIT_X.length], SLIT_Y[k - 1]] : [MID_X[sx % MID_X.length], row];
    default: return [MID_X[sx % MID_X.length], row];
  }
}

/**
 * What a face's cap sub-tile also draws on the wall top above it: a pilaster's rounded top, or a great window's gable
 * (one sub-tile, or two for the gable). Each is [source, how many sub-tiles above the cap].
 */
export function castleAboveCap(style: CastleFaceStyle, sx: number, decor: WallDecor | undefined): Array<[Src, number]> {
  if (style === 'pillarL') return [[[PILASTER_X, PILASTER_TOP_Y], 1]];
  const parts = style === 'decor' && decor ? decorParts(decor) : null;
  if (!parts || parts.art !== DECOR_ART.gothic) return [];
  const x = parts.art.x + (parts.index * 2 + (sx & 1)) * 16;
  return [[[x, GOTHIC_GABLE_Y[0]], 2], [[x, GOTHIC_GABLE_Y[1]], 1]];
}

/** The plinth under a face sub-tile (8 tall), or a pilaster's base (a whole sub-tile). */
export function castlePlinth(style: CastleFaceStyle, sx: number): { src: Src; h: number } {
  if (style === 'pillarL') return { src: [PILASTER_X, PLINTH_Y], h: 16 };
  if (style === 'left') return { src: [LEFT_X, PLINTH_Y], h: 8 };
  if (style === 'right') return { src: [RIGHT_X, PLINTH_Y], h: 8 };
  return { src: [MID_X[sx % MID_X.length], PLINTH_Y], h: 8 };
}

/**
 * The great stone arch over a passage two tiles wide. Its art (80 wide) is narrower than the passage and the faces
 * either side of it, so it is drawn in halves set apart, a slice of its crown between them, each leg standing wholly on
 * the face beside the passage (never over the floor anyone walks on). Its peak's single row is left off, so the crown
 * runs flat across the slice.
 */
const ARCH_ART = { x: 0, y: 212, w: 80, h: 108 };
/** Where its halves part (in the art), and the slice of crown laid between them. */
const ARCH_SPLIT = 40;
const ARCH_CROWN = { x: 32, w: 16 };
/** The crown slice is only the band over the opening (its top 20 rows); below it is the open passage the halves frame. */
const ARCH_CROWN_OPEN = 88;
/** The opening (in sub-tiles) the arch spans, and how far its legs stand on the faces either side (one sub-tile). */
export const CASTLE_ARCH_SPAN = 4;
const ARCH_LEG = 16;

/**
 * The great arch over an opening starting at world x `ox` (CASTLE_ARCH_SPAN sub-tiles wide) whose faces stand on the
 * floor at `footY`: its pieces, sorted at that foot, so whoever is in the passage is under it and whoever is in front
 * of the wall is drawn over it.
 */
export function castleArchPieces(ox: number, footY: number): CastlePiece[] {
  const a = ARCH_ART;
  const dy = footY - a.h;
  const left = ox - ARCH_LEG;
  const crownX = left + ARCH_SPLIT;
  const right = crownX + ARCH_CROWN.w;
  return [
    { dx: left, dy, sx: a.x, sy: a.y, w: ARCH_SPLIT, h: a.h, z: footY },
    { dx: crownX, dy, sx: a.x + ARCH_CROWN.x, sy: a.y, w: ARCH_CROWN.w, h: a.h - ARCH_CROWN_OPEN, z: footY },
    { dx: right, dy, sx: a.x + ARCH_SPLIT, sy: a.y, w: a.w - ARCH_SPLIT, h: a.h, z: footY },
  ];
}

/**
 * Stairs (64×32: four steps), laid across a passage two tiles wide that runs north and south — the way up or down
 * between the castle's rooms.
 */
const STAIRS = { x: 416, y: 528, w: 64, h: 32 };

export function stairsPiece(tx: number, ty: number): CastlePiece {
  return { dx: tx * TILE_WIDTH, dy: ty * TILE_HEIGHT, sx: STAIRS.x, sy: STAIRS.y, w: STAIRS.w, h: STAIRS.h };
}

/** The spike pit (124×66), centred on its 4×2 tiles; spikes rise from its floor, and now and then a stone slab. */
export const SPIKE_PIT_ART = { x: 266, y: 359, w: 124, h: 66, dx: 2, dy: -1 };
const SPIKES = { x: 512, y: 391, w: 48, h: 42 };
const SLAB = { x: 368, y: 112, w: 32, h: 80 };
/**
 * The pit's floor (where spikes stand) is this far down its tiles; spikes stand at these offsets across it, and a slab
 * at its east end (clear of the middle, where whoever falls in drops, so it never hides them).
 */
const PIT_FLOOR = 56;
const SPIKE_XS = [12, 52];
const SLAB_X = 86;

export type CastlePiece = { dx: number; dy: number; sx: number; sy: number; w: number; h: number; z?: number };

/** A spike pit's art at tile (px, py): the framed pit, its spikes, and (when `slab`) a slab standing in it. */
export function spikePitPieces(px: number, py: number, slab: boolean): CastlePiece[] {
  const x = px * TILE_WIDTH;
  const y = py * TILE_HEIGHT;
  const a = SPIKE_PIT_ART;
  const pieces: CastlePiece[] = [{ dx: x + a.dx, dy: y + a.dy, sx: a.x, sy: a.y, w: a.w, h: a.h }];
  for (const sx of SPIKE_XS) pieces.push({ dx: x + sx, dy: y + PIT_FLOOR - SPIKES.h, sx: SPIKES.x, sy: SPIKES.y, w: SPIKES.w, h: SPIKES.h });
  // A slab rises above the pit's rim, so it sorts with whoever walks past it.
  if (slab) pieces.push({ dx: x + SLAB_X, dy: y + PIT_FLOOR - SLAB.h, sx: SLAB.x, sy: SLAB.y, w: SLAB.w, h: SLAB.h, z: y + PIT_FLOOR });
  return pieces;
}

/** A pool's art (124×98), centred on its 4×3 tiles like the spike pit. */
const POOL_ART: Readonly<Record<PoolKind, { x: number; y: number }>> = { water: { x: 266, y: 439 }, sludge: { x: 266, y: 599 } };
const POOL_SIZE = { w: 124, h: 98 };

export function poolPiece(pool: { x: number; y: number; kind: PoolKind }): CastlePiece {
  const art = POOL_ART[pool.kind];
  const dx = pool.x * TILE_WIDTH + (POOL_W * TILE_WIDTH - POOL_SIZE.w) / 2;
  const dy = pool.y * TILE_HEIGHT + (POOL_H * TILE_HEIGHT - POOL_SIZE.h) / 2;
  return { dx, dy, sx: art.x, sy: art.y, w: POOL_SIZE.w, h: POOL_SIZE.h };
}

// ── Floors ────────────────────────────────────────────────────────────────────

/**
 * The castle's floors, each a block of slabs cut from the tileset and laid by tile position so its pattern runs on:
 * teal slabs (2×2 tiles), the same stained dark in great patches (4×4), and brown slabs (2×2), which also floor the
 * safe and exit rooms.
 */
const TEAL = { x: 0, y: 352, span: 2 };
const TEAL_STAINED = { x: 0, y: 432, span: 4 };
const BROWN = { x: 128, y: 352, span: 2 };
const BROWN_STAINED = { x: 128, y: 432, span: 4 };

export type CastleFloor = { kind: 'stone' | 'rough' | 'safe'; sx: number; sy: number };

function laid(block: { x: number; y: number; span: number }, tx: number, ty: number): Src {
  return [block.x + (tx % block.span) * TILE_WIDTH, block.y + (ty % block.span) * TILE_HEIGHT];
}

/** Noise levels above which the slabs are stained, or brown (and above which brown is stained too). */
const STAINED_LEVEL = 0.62;
const BROWN_LEVEL = 0.8;
const BROWN_STAINED_LEVEL = 0.9;

/** The floor of a castle tile, by where it is (`n`: the floor noise there, 0–1). */
export function castleFloor(level: Level, tx: number, ty: number, n: number): CastleFloor {
  const at = (kind: CastleFloor['kind'], src: Src): CastleFloor => ({ kind, sx: src[0], sy: src[1] });
  if (level.isSafeZone(tx, ty)) return at('safe', laid(BROWN, tx, ty));
  if (n > BROWN_STAINED_LEVEL) return at('rough', laid(BROWN_STAINED, tx, ty));
  if (n > BROWN_LEVEL) return at('rough', laid(BROWN, tx, ty));
  if (n > STAINED_LEVEL) return at('stone', laid(TEAL_STAINED, tx, ty));
  return at('stone', laid(TEAL, tx, ty));
}
