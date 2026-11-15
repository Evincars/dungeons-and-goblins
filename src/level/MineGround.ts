import type { FloorZone, Level } from './Level';
import type { TerrainPiece } from './TerrainAutotile';
import { TileType, TILE_HEIGHT, TILE_WIDTH } from './TileType';
import { forEachTile, tileHash } from './Grid';
import { MINE_GROUND, MINE_GROUND_BLOCKS } from './MineTiles';

/**
 * Where the mines' tones of earth meet (MineTerrain.ts lays which tone each tile is), they run into each other along a
 * ragged edge that wanders across the tiles instead of stopping at their sides, one tone reaching well into the other
 * here and falling short there, with specks of it strewn past its edge.
 *
 * How: think of a cell between the middles of four tiles (a dual grid). Each of its corners is a tile's tone; across the
 * cell a tone's share fades from its corners (bilinearly), and a pixel is that tone where its share, moved by a little
 * noise, passes one half. The noise is laid by world position (and repeats every NOISE_PERIOD px, as the ground does), so
 * the edge runs on unbroken from cell to cell. Each tile is drawn as its four quarters, each the corner of one cell: its
 * lowest tone as plain ground, then each higher tone over it, cut by that edge (render/MineGroundAtlas.ts bakes the cuts).
 */

/**
 * A patch of earth fills an ellipse in its zone, its rim eaten away by up to this share of the radius (by hash) so no
 * two patches have the same outline.
 */
const PATCH_RAGGED = 0.45;

/**
 * The tone (MINE_GROUND_BLOCKS index) a tile's ground is laid in: the last patch whose ragged ellipse holds it, else the
 * last whole zone holding it.
 */
export function mineFloorTone(level: Level, tx: number, ty: number): number {
  return minePatchAt(level, tx, ty)?.tone ?? mineBaseTone(level, tx, ty);
}

/** The tone of the last whole zone (not a patch) holding a tile. */
export function mineBaseTone(level: Level, tx: number, ty: number): number {
  for (let i = level.floorZones.length - 1; i >= 0; i--) {
    const z = level.floorZones[i];
    if (!z.patch && inZone(z, tx, ty)) return z.tone;
  }
  return 0;
}

/** The last patch zone whose ragged ellipse holds a tile, if any. */
export function minePatchAt(level: Level, tx: number, ty: number): FloorZone | null {
  const zones = level.floorZones;
  for (let i = zones.length - 1; i >= 0; i--) {
    if (zones[i].patch && inPatchShape(zones[i], tx, ty)) return zones[i];
  }
  return null;
}

/** Where in the ground sheet a tile's earth is: its tone's block, laid by position so it runs on. */
export function mineFloorSource(level: Level, tx: number, ty: number, tone = mineFloorTone(level, tx, ty)): { sx: number; sy: number } {
  const block = MINE_GROUND_BLOCKS[tone] ?? MINE_GROUND_BLOCKS[0];
  return { sx: block.x + ((tx * TILE_WIDTH) % block.w), sy: block.y + ((ty * TILE_HEIGHT) % block.h) };
}

function inZone(z: FloorZone, tx: number, ty: number): boolean {
  return tx >= z.x && ty >= z.y && tx < z.x + z.w && ty < z.y + z.h;
}

/** Whether a tile lies inside a patch zone's ragged ellipse. */
function inPatchShape(z: FloorZone, tx: number, ty: number): boolean {
  if (!inZone(z, tx, ty)) return false;
  const nx = (tx + 0.5 - (z.x + z.w / 2)) / (z.w / 2);
  const ny = (ty + 0.5 - (z.y + z.h / 2)) / (z.h / 2);
  const ragged = ((tileHash(tx, ty) >>> 3) % 100) / 100 * PATCH_RAGGED;
  return nx * nx + ny * ny <= 1 - ragged;
}

/** The noise (and so every cut) repeats this often across the world: as often as the ground's own blocks do. */
export const NOISE_PERIOD = MINE_GROUND_BLOCKS[0].w;
/** The noise's octaves: the spacing (px) of its lattice and its weight. Each spacing divides NOISE_PERIOD. */
const OCTAVES = [[16, 0.55], [8, 0.3], [4, 0.15]] as const;
/** How far the noise moves a tone's share: nearly half of it, so an edge wanders up to about a third of a tile either way. */
const WANDER = 0.9;
/** Each octave's lattice is hashed apart from the others' by this much. */
const OCTAVE_SALT = 7919;
/** A quarter of a tile. */
const QUARTER = TILE_WIDTH / 2;

/** A higher tone's ground over a tile's quarter, cut by its edge: from the cell (its tone, which corners are it, its phase). */
export type MineGroundOverlay = {
  dx: number; dy: number; w: number; h: number;
  tone: number;
  /** The cell's corners that are this tone or higher: TL 1, TR 2, BL 4, BR 8. */
  corners: number;
  /** Where the cell lies in the noise's (and the ground's) period, px. */
  px: number; py: number;
  /** The quarter's box in the cell. */
  sx: number; sy: number;
};

/** The tone of a tile's earth, or null where there is no ground (rock, a chasm, off the map). */
function toneAt(level: Level, tx: number, ty: number): number | null {
  const tile = level.getTile(tx, ty);
  if (!tile) return null;
  const floored = tile.type === TileType.Floor || tile.type === TileType.Obstacle || level.slopes.has(tx + ty * level.width);
  const pitFloor = tile.type === TileType.Hole && level.hasPit(tx, ty);
  return floored || pitFloor ? mineFloorTone(level, tx, ty) : null;
}

/**
 * The tones at the corners of the cell whose top-left corner is the middle of tile (cx, cy): TL, TR, BL, BR. A corner on
 * no ground takes the tone most of the others are (the lower on a tie), so no edge runs into the rock; null if none is
 * ground. Worked out the same for every tile that has a quarter in the cell, so its quarters meet.
 */
export function cellTones(level: Level, cx: number, cy: number): number[] | null {
  const tones = [toneAt(level, cx, cy), toneAt(level, cx + 1, cy), toneAt(level, cx, cy + 1), toneAt(level, cx + 1, cy + 1)];
  const known = tones.filter((t): t is number => t !== null);
  if (known.length === 0) return null;
  const fill = mostCommon(known);
  return tones.map((t) => t ?? fill);
}

function mostCommon(tones: readonly number[]): number {
  let best = tones[0];
  let bestCount = 0;
  for (const t of tones) {
    const count = tones.filter((u) => u === t).length;
    if (count > bestCount || (count === bestCount && t < best)) {
      best = t;
      bestCount = count;
    }
  }
  return best;
}

/** n mod m, never negative. */
function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/** A lattice point's value, 0..1, repeating every NOISE_PERIOD px. */
function latticeValue(i: number, j: number, spacing: number, salt: number): number {
  const cells = NOISE_PERIOD / spacing;
  return (tileHash(mod(i, cells) + salt, mod(j, cells)) % 1024) / 1023;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** The noise at a world pixel, 0..1, repeating every NOISE_PERIOD px. */
export function groundNoise(x: number, y: number): number {
  let sum = 0;
  OCTAVES.forEach(([spacing, weight], k) => {
    const gx = x / spacing;
    const gy = y / spacing;
    const i = Math.floor(gx);
    const j = Math.floor(gy);
    const u = smooth(gx - i);
    const v = smooth(gy - j);
    const salt = k * OCTAVE_SALT;
    const top = latticeValue(i, j, spacing, salt) * (1 - u) + latticeValue(i + 1, j, spacing, salt) * u;
    const bottom = latticeValue(i, j + 1, spacing, salt) * (1 - u) + latticeValue(i + 1, j + 1, spacing, salt) * u;
    sum += weight * (top * (1 - v) + bottom * v);
  });
  return sum;
}

/**
 * Whether pixel (x, y) of a cell (its corners `corners` of the tone, its phase (px, py)) is that tone: its share from the
 * corners, moved by the noise there, passes one half. Pixels a little outside the cell are answered too (for its edge).
 */
export function overlayCovers(corners: number, px: number, py: number, x: number, y: number): boolean {
  const u = (x + 0.5) / TILE_WIDTH;
  const v = (y + 0.5) / TILE_HEIGHT;
  const bit = (b: number): number => ((corners & b) !== 0 ? 1 : 0);
  const share = bit(1) * (1 - u) * (1 - v) + bit(2) * u * (1 - v) + bit(4) * (1 - u) * v + bit(8) * u * v;
  return share + (groundNoise(px + x, py + y) - 0.5) * WANDER > 0.5;
}

/** A quarter of a tile: which cell it lies in, and where in that cell. */
type Quarter = { qx: number; qy: number; cx: number; cy: number; tones: number[] | null };

function quarters(level: Level, tx: number, ty: number): Quarter[] {
  const out: Quarter[] = [];
  for (const [qx, qy] of QUARTERS) {
    const cx = tx - 1 + qx;
    const cy = ty - 1 + qy;
    out.push({ qx, qy, cx, cy, tones: cellTones(level, cx, cy) });
  }
  return out;
}

const QUARTERS = [[0, 0], [1, 0], [0, 1], [1, 1]] as const;

/** A box of a tone's ground, laid by world position so it runs on. */
function earthPiece(tone: number, dx: number, dy: number, w: number, h: number): TerrainPiece {
  const block = MINE_GROUND_BLOCKS[tone] ?? MINE_GROUND_BLOCKS[0];
  return { dx, dy, sx: block.x + mod(dx, block.w), sy: block.y + mod(dy, block.h), w, h, sheet: MINE_GROUND, floor: true };
}

/** Whether every quarter of a tile lies in a cell of one tone, its own. */
function uniform(qs: readonly Quarter[], tone: number): boolean {
  return qs.every((q) => !q.tones || q.tones.every((t) => t === tone));
}

/**
 * The plain ground under a floor tile: the whole tile in its tone where no other tone comes near it, else each quarter
 * in the lowest tone of its cell (the higher ones are laid over it, mineGroundOverlays).
 */
export function mineGroundBase(level: Level, tx: number, ty: number): TerrainPiece[] {
  const tone = mineFloorTone(level, tx, ty);
  const qs = quarters(level, tx, ty);
  const dx = tx * TILE_WIDTH;
  const dy = ty * TILE_HEIGHT;
  if (uniform(qs, tone)) return [earthPiece(tone, dx, dy, TILE_WIDTH, TILE_HEIGHT)];
  return qs.map((q) => earthPiece(q.tones ? Math.min(...q.tones) : tone, dx + q.qx * QUARTER, dy + q.qy * QUARTER, QUARTER, QUARTER));
}

/** The higher tones laid over a floor tile's quarters, each cut by its ragged edge. */
function overlaysOf(level: Level, tx: number, ty: number, out: MineGroundOverlay[]): void {
  for (const q of quarters(level, tx, ty)) {
    if (!q.tones) continue;
    const base = Math.min(...q.tones);
    const px = mod(q.cx * TILE_WIDTH + QUARTER, NOISE_PERIOD);
    const py = mod(q.cy * TILE_HEIGHT + QUARTER, NOISE_PERIOD);
    const tones = q.tones;
    for (const tone of [...new Set(tones)].filter((t) => t > base).sort((a, b) => a - b)) {
      const corners = tones.reduce((bits, t, i) => (t >= tone ? bits | (1 << i) : bits), 0);
      const sx = (1 - q.qx) * QUARTER;
      const sy = (1 - q.qy) * QUARTER;
      out.push({ dx: tx * TILE_WIDTH + q.qx * QUARTER, dy: ty * TILE_HEIGHT + q.qy * QUARTER, w: QUARTER, h: QUARTER, tone, corners, px, py, sx, sy });
    }
  }
}

/** Every ragged edge where a mine level's tones of earth meet, worked out once when its terrain is built. */
export function mineGroundOverlays(level: Level): MineGroundOverlay[] {
  const out: MineGroundOverlay[] = [];
  if (level.theme !== 'mines') return out;
  forEachTile(0, 0, level.width - 1, level.height - 1, (tx, ty) => {
    if (toneAt(level, tx, ty) !== null) overlaysOf(level, tx, ty, out);
  });
  return out;
}
