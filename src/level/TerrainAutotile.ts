import type { Level } from './Level';
import type { TileData } from './TileType';
import { forEachTile } from './Grid';
import { TileType, TILE_WIDTH, TILE_HEIGHT } from './TileType';

/**
 * One textured quad: draw tileset rect (sx,sy,w,h) at world (dx,dy). Pieces with
 * a `z` are drawn among the entities at that depth (walls characters can stand
 * behind, arch lintels); the rest lie flat beneath everything.
 */
export type TerrainPiece = {
  dx: number; dy: number; sx: number; sy: number; w: number; h: number; z?: number;
  /** Texture the rect is cut from, when not the catacomb tileset: cave ground lies beneath all of it. */
  sheet?: typeof CAVE_GROUND;
};

/** The cave tileset (/caves/MainLev2.0.png), whose charcoal ground tiles floor the cave halls. */
export const CAVE_GROUND = 'cave_ground';

// Terrain is autotiled on 16px sub-tiles (the tileset's native grid); walls are
// outlined with 8px quarter pieces. A wall mass renders as black void with a
// stone border wherever it meets floor, and a brick face on its south side —
// the way catacombs maps are built with mainlevbuild.png.
const SUB = 16;
const Q = 8;

// ── Tileset coordinates (mainlevbuild.png) ───────────────────────────────────
// Wall-top outline quarters (from the framed block at cols 4–15, rows 3–6)
const OUTER_TL = [64, 48] as const;
const OUTER_TR = [248, 48] as const;
const EDGE_TOP_L = [96, 48] as const;
const EDGE_TOP_R = [104, 48] as const;
const EDGE_LEFT = [[64, 80], [64, 88]] as const;    // [upper, lower] quarter
const EDGE_RIGHT = [[248, 80], [248, 88]] as const;

// South face: cap molding (row 7) over three brick rows (rows 8–10)
const FACE_CAP_Y = 112;
const FACE_BRICK_Y = [160, 144, 128]; // k=1 (lowest), k=2, k=3
const FACE_LEFT_X = 64;    // pillar strip on the left
const FACE_RIGHT_X = 240;  // pillar strip on the right
const FACE_MID_X = [80, 96, 112, 128];
const PILLAR_X = [144, 160];           // 32px column centred on the pair
const WINDOW_X = [272, 288, 304, 320, 336];
const WINDOW_Y = [240, 224, 208];      // arched-window bricks, k=1..3
const CRACKED_Y = [304, 288, 272];     // crumbling bricks for breakable walls
const BASE_Y = 176;                    // 8px plinth under the face, drawn on the floor
// Tomb niche face: bones in dark recesses (rows 12–15), 4 sub-tiles wide
const NICHE_X = [80, 176];
const NICHE_CAP_Y = 192;
const NICHE_Y = [240, 224, 208];

// Arch lintel (cols 19–23, rows 1–2): angled ends with short legs, stretchable bar
const LINTEL_LEFT = [304, 16] as const;
const LINTEL_RIGHT = [368, 16] as const;
const LINTEL_MID_X = [320, 336, 352];
const LINTEL_Y = 16;
const LINTEL_END_H = 24;
const LINTEL_BAR_H = 16;
/** Lintels sit this far above the row they span, so their legs rest on it. */
const LINTEL_LIFT = 8;
const ARCH_MIN = 2;
const ARCH_MAX = 8;
/** Arch lintels are overhead: drawn above every character (the fog of war still covers them). */
export const OVERHEAD_Z = 1e6;

// Framed 2×2 pit (cols 38–43, rows 16–21): 64px hole with a 5px rim outside it
const PIT = { x: 619, y: 267, w: 74, h: 74, rim: 5 };

// Floors (32×32, each window sits on a fully opaque band)
// Main floor: teal cobble variants that share one hue, so they blend seamlessly.
const FLOOR_MAIN: Array<[number, number]> = [
  [832, 272], [880, 272], [832, 320], [880, 320], [832, 368], [880, 368],
];
// Low-frequency patches: mossy cobble, and rarer crumbled earth.
const FLOOR_PATCH: Array<[number, number]> = [[928, 272], [976, 272], [928, 320], [976, 320]];
const FLOOR_ROUGH: Array<[number, number]> = [[304, 336], [336, 336], [304, 400], [336, 400]];
const FLOOR_SAFE: Array<[number, number]> = [[832, 208]];
const FLOOR_GRATE: [number, number] = [496, 288];

// Cave ground (MainLev2.0.png, charcoal set): bare earth, pebbles, and tufts of blue grass.
const CAVE_PLAIN: Array<[number, number]> = [[0, 1472], [32, 1472], [0, 1504], [32, 1504], [64, 1472], [96, 1472]];
const CAVE_PEBBLES: Array<[number, number]> = [
  [0, 1344], [32, 1344], [64, 1344], [96, 1344], [0, 1376], [32, 1376], [64, 1376], [96, 1376],
];
const CAVE_GRASS: Array<[number, number]> = [[128, 1376], [160, 1376], [192, 1376], [224, 1376], [256, 1376]];

// Pit interior for holes that aren't part of a framed 2×2 pit
const PIT_WALL: Array<[number, number]> = [[384, 208], [384, 224]];

/** Every Nth tile column of a full-height face gets a stone pillar. */
export const PILLAR_EVERY = 6;
export const PILLAR_PHASE = 3;

function hash(x: number, y: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Smooth value noise in [0,1) for floor patches. */
function noise(x: number, y: number, scale: number): number {
  const fx = x / scale, fy = y / scale;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = fx - x0, ty = fy - y0;
  const r = (a: number, b: number) => (hash(a, b) & 0xffff) / 0x10000;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const top = r(x0, y0) + (r(x0 + 1, y0) - r(x0, y0)) * sx;
  const bot = r(x0, y0 + 1) + (r(x0 + 1, y0 + 1) - r(x0, y0 + 1)) * sx;
  return top + (bot - top) * sy;
}

/** A sub-tile of plain black wall-top void (inside the framed block at col 6, row 5). */
const VOID = [96, 80] as const;

/** Tallest a south face gets, in sub-tiles: a cap over three brick rows. */
const FACE_MAX = 4;
/** Sub-tiles of a framed 2×2 pit along each side. */
const PIT_SUBTILES = 4;
/** Floor value-noise scale in tiles, and the noise levels above which patches and rough earth show. */
const FLOOR_NOISE_SCALE = 6;
const FLOOR_ROUGH_LEVEL = 0.82;
const FLOOR_PATCH_LEVEL = 0.64;
/** Cave halls: noise scale (tiles) of their patches of cave ground, the level above which a tile is cave
 *  ground, and the levels above which that ground grows grass or is strewn with pebbles. */
const CAVE_NOISE_SCALE = 4;
const CAVE_LEVEL = 0.32;
const CAVE_GRASS_LEVEL = 0.72;
const CAVE_PEBBLE_EVERY = 4;
/** One floor tile in this many (by hash) is a drain grate. */
const GRATE_EVERY = 53;
/** One plain full-height face column in this many (by hash) shows an arched window. */
const WINDOW_EVERY = 9;
/** The void that covers characters behind a wall row sorts just under the wall row itself. */
const VOID_BELOW_WALL = 0.5;

type FaceStyle = 'left' | 'right' | 'mid' | 'pillarL' | 'pillarR' | 'window' | 'cracked' | 'niche';
type Src = readonly [number, number];

function quad(out: TerrainPiece[], dx: number, dy: number, s: Src, w: number, h: number, z?: number): void {
  out.push(z === undefined ? { dx, dy, sx: s[0], sy: s[1], w, h } : { dx, dy, sx: s[0], sy: s[1], w, h, z });
}

/** Plinth strip under a face sub-tile of the given style. */
function plinthX(style: FaceStyle): number {
  if (style === 'left') return FACE_LEFT_X;
  if (style === 'right') return FACE_RIGHT_X;
  if (style === 'pillarL') return PILLAR_X[0];
  if (style === 'pillarR') return PILLAR_X[1];
  return FACE_MID_X[1];
}

/**
 * Autotiles one level on the 16px sub-tile grid. Each pass appends to one of three lists, drawn in
 * order: floors, then walls and faces, then overlays (plinths, pit rims, lintels, behind-the-wall void).
 */
class TerrainBuilder {
  private readonly W: number;
  private readonly H: number;
  /** For each face sub-tile: its row counted up from the face's foot (1 = lowest), and the face's height. */
  private readonly faceK: Int8Array;
  private readonly faceH: Int8Array;
  /** Sub-tiles covered by a framed pit's art, which loose-hole art must not draw over. */
  private readonly framed = new Set<number>();
  readonly floorPieces: TerrainPiece[] = [];
  readonly wallPieces: TerrainPiece[] = [];
  readonly overlayPieces: TerrainPiece[] = [];

  constructor(private readonly level: Level) {
    this.W = level.width * 2;
    this.H = level.height * 2;
    this.faceK = new Int8Array(this.W * this.H);
    this.faceH = new Int8Array(this.W * this.H);
  }

  build(): TerrainPiece[] {
    forEachTile(0, 1, this.W - 1, this.H - 1, this.markFace);
    forEachTile(0, 0, this.level.width - 1, this.level.height - 1, this.addFloor);
    for (const p of this.level.pits) this.addPit(p);
    forEachTile(0, 0, this.W - 1, this.H - 1, this.addSubTile);
    forEachTile(0, 0, this.W - 3, this.H - 1, this.addArch);
    return [...this.floorPieces, ...this.wallPieces, ...this.overlayPieces];
  }

  // ── Sub-tile queries ───────────────────────────────────────────────────────

  private tileAt(sx: number, sy: number): TileData | null {
    return sx < 0 || sy < 0 || sx >= this.W || sy >= this.H ? null : this.level.getTile(sx >> 1, sy >> 1);
  }

  private solid(sx: number, sy: number): boolean {
    const t = this.tileAt(sx, sy);
    return !t || t.type === TileType.Wall || t.type === TileType.BreakableWall;
  }

  private hole(sx: number, sy: number): boolean {
    return this.tileAt(sx, sy)?.type === TileType.Hole;
  }

  private isFace(sx: number, sy: number): boolean {
    return sx >= 0 && sy >= 0 && sx < this.W && sy < this.H && this.faceK[sx + sy * this.W] > 0;
  }

  /** Depth of a wall sub-tile whose tile has walkable floor directly north (drawn over characters there). */
  private occluderZ(sx: number, sy: number): number | undefined {
    const tx = sx >> 1, ty = sy >> 1;
    if (!this.level.getTile(tx, ty - 1)?.passable) return undefined;
    return (ty + 1) * TILE_HEIGHT;
  }

  // ── Faces: up to 4 solid sub-tiles directly above an open one ──────────────

  private readonly markFace = (sx: number, sy: number): void => {
    if (this.solid(sx, sy) || !this.solid(sx, sy - 1)) return;
    let t = 0;
    while (t < FACE_MAX && this.solid(sx, sy - 1 - t)) t++;
    for (let k = 1; k <= t; k++) {
      const y = sy - k;
      if (y < 0) break;
      this.faceK[sx + y * this.W] = k;
      this.faceH[sx + y * this.W] = t;
    }
  };

  /** A pillar needs both halves of the tile to be plain full-height face. */
  private pillarFits(tx: number, bottom: number): boolean {
    const lx = tx * 2;
    return [lx, lx + 1].every((x) => this.isFace(x, bottom) && this.faceH[x + bottom * this.W] === FACE_MAX
      && this.solid(x - 1, bottom) && this.solid(x + 1, bottom));
  }

  private faceStyle(sx: number, sy: number): FaceStyle {
    const i = sx + sy * this.W;
    const h = this.faceH[i];
    const bottom = sy + this.faceK[i] - 1;
    if (!this.solid(sx - 1, sy)) return 'left';
    if (!this.solid(sx + 1, sy)) return 'right';
    if (this.tileAt(sx, sy)?.type === TileType.BreakableWall) return 'cracked';
    const tx = sx >> 1;
    const full = h === FACE_MAX;
    if (full && this.level.wallDecor.get(tx + (bottom >> 1) * this.level.width)?.startsWith('niche')) return 'niche';
    if (full && tx % PILLAR_EVERY === PILLAR_PHASE && this.pillarFits(tx, bottom)) return sx === tx * 2 ? 'pillarL' : 'pillarR';
    if (full && hash(tx, bottom) % WINDOW_EVERY === 0) return 'window';
    return 'mid';
  }

  // ── Floors (per 32px game tile; obstacles stand on floor) ──────────────────

  private readonly addFloor = (tx: number, ty: number): void => {
    const t = this.level.getTile(tx, ty);
    if (!t || (t.type !== TileType.Floor && t.type !== TileType.Obstacle)) return;
    const cave = this.caveSource(tx, ty);
    if (cave) {
      this.floorPieces.push({ dx: tx * TILE_WIDTH, dy: ty * TILE_HEIGHT, sx: cave[0], sy: cave[1], w: TILE_WIDTH, h: TILE_HEIGHT, sheet: CAVE_GROUND });
      return;
    }
    quad(this.floorPieces, tx * TILE_WIDTH, ty * TILE_HEIGHT, this.floorSource(t, tx, ty), TILE_WIDTH, TILE_HEIGHT);
  };

  /** In a cave hall, patches of the floor are cave ground: bare, pebbly or grassy. */
  private caveSource(tx: number, ty: number): Src | null {
    if (!this.level.caveFloor.has(tx + ty * this.level.width)) return null;
    const n = noise(tx, ty, CAVE_NOISE_SCALE);
    if (n < CAVE_LEVEL) return null;
    const v = hash(tx, ty);
    if (n > CAVE_GRASS_LEVEL) return CAVE_GRASS[v % CAVE_GRASS.length];
    if (v % CAVE_PEBBLE_EVERY === 0) return CAVE_PEBBLES[v % CAVE_PEBBLES.length];
    return CAVE_PLAIN[v % CAVE_PLAIN.length];
  }

  private floorSource(t: TileData, tx: number, ty: number): Src {
    const v = hash(tx, ty);
    if (this.level.isSafeZone(tx, ty)) return FLOOR_SAFE[v % FLOOR_SAFE.length];
    const n = noise(tx, ty, FLOOR_NOISE_SCALE);
    if (v % GRATE_EVERY === 0 && t.type === TileType.Floor) return FLOOR_GRATE;
    if (n > FLOOR_ROUGH_LEVEL) return FLOOR_ROUGH[v % FLOOR_ROUGH.length];
    if (n > FLOOR_PATCH_LEVEL) return FLOOR_PATCH[v % FLOOR_PATCH.length];
    return FLOOR_MAIN[v % FLOOR_MAIN.length];
  }

  // ── Framed pits (2×2 holes) — rims spill onto the surrounding floor ────────

  private addPit(p: { x: number; y: number }): void {
    forEachTile(0, 0, PIT_SUBTILES - 1, PIT_SUBTILES - 1, (dx, dy) => this.framed.add(p.x * 2 + dx + (p.y * 2 + dy) * this.W));
    this.overlayPieces.push({
      dx: p.x * TILE_WIDTH - PIT.rim, dy: p.y * TILE_HEIGHT - PIT.rim,
      sx: PIT.x, sy: PIT.y, w: PIT.w, h: PIT.h,
    });
  }

  // ── Walls, loose holes and plinths (per 16px sub-tile) ─────────────────────

  private readonly addSubTile = (sx: number, sy: number): void => {
    const dx = sx * SUB;
    const dy = sy * SUB;
    if (!this.solid(sx, sy)) {
      this.addOpenSubTile(sx, sy, dx, dy);
      return;
    }
    const z = this.occluderZ(sx, sy);
    if (this.faceK[sx + sy * this.W] > 0) quad(this.wallPieces, dx, dy, this.faceSource(sx, sy), SUB, SUB, z);
    else this.addWallTop(sx, sy, dx, dy, z);
  };

  private addOpenSubTile(sx: number, sy: number, dx: number, dy: number): void {
    // Plinth along the foot of a face, laid over the floor
    if (!this.hole(sx, sy) && this.isFace(sx, sy - 1) && this.faceK[sx + (sy - 1) * this.W] === 1) {
      quad(this.overlayPieces, dx, dy, [plinthX(this.faceStyle(sx, sy - 1)), BASE_Y], SUB, Q);
    }
    // A hole outside a framed pit: dark brick lip under open floor, then black
    if (!this.hole(sx, sy) || this.framed.has(sx + sy * this.W)) return;
    const floorAbove = (y: number) => !this.solid(sx, y) && !this.hole(sx, y);
    if (floorAbove(sy - 1)) quad(this.wallPieces, dx, dy, PIT_WALL[0], SUB, SUB);
    else if (this.hole(sx, sy - 1) && floorAbove(sy - 2)) quad(this.wallPieces, dx, dy, PIT_WALL[1], SUB, SUB);
  }

  private faceSource(sx: number, sy: number): Src {
    const i = sx + sy * this.W;
    const k = this.faceK[i];
    const cap = k === this.faceH[i];
    const brick = cap ? FACE_CAP_Y : FACE_BRICK_Y[k - 1];
    switch (this.faceStyle(sx, sy)) {
      case 'left': return [FACE_LEFT_X, brick];
      case 'right': return [FACE_RIGHT_X, brick];
      case 'pillarL': return [PILLAR_X[0], brick];
      case 'pillarR': return [PILLAR_X[1], brick];
      case 'niche': return this.nicheSource(sx, sy, k, cap);
      case 'window': return cap ? [FACE_MID_X[sx % 4], FACE_CAP_Y] : [WINDOW_X[(sx >> 1) % WINDOW_X.length], WINDOW_Y[k - 1]];
      case 'cracked': return cap ? [FACE_MID_X[sx % 4], FACE_CAP_Y] : [272 + (sx % 8) * 16, CRACKED_Y[k - 1]];
      default: return [FACE_MID_X[sx % 4], brick];
    }
  }

  private nicheSource(sx: number, sy: number, k: number, cap: boolean): Src {
    const wallRow = (sy + k - 1) >> 1;
    const decor = this.level.wallDecor.get((sx >> 1) + wallRow * this.level.width);
    const right = decor === 'niche1';
    const col = (right ? 2 : 0) + (sx & 1);
    // Both tiles of a niche pick the same art, keyed by the segment's left tile.
    const base = NICHE_X[hash((sx >> 1) - (right ? 1 : 0), wallRow) % NICHE_X.length];
    return [base + col * SUB, cap ? NICHE_CAP_Y : NICHE_Y[k - 1]];
  }

  /** Wall top: void with a stone outline toward open floor (or a face beside it). */
  private addWallTop(sx: number, sy: number, dx: number, dy: number, z: number | undefined): void {
    const out = this.wallPieces;
    const openN = !this.solid(sx, sy - 1);
    const sideW = !this.solid(sx - 1, sy) || this.isFace(sx - 1, sy);
    const sideE = !this.solid(sx + 1, sy) || this.isFace(sx + 1, sy);
    const diagNW = !this.solid(sx - 1, sy - 1);
    const diagNE = !this.solid(sx + 1, sy - 1);

    // upper-left quarter
    if (sideW && openN) quad(out, dx, dy, OUTER_TL, Q, Q, z);
    else if (sideW) quad(out, dx, dy, EDGE_LEFT[0], Q, Q, z);
    else if (openN) quad(out, dx, dy, EDGE_TOP_L, Q, Q, z);
    else if (diagNW) quad(out, dx, dy, EDGE_LEFT[0], Q, Q, z);
    // upper-right quarter
    if (sideE && openN) quad(out, dx + Q, dy, OUTER_TR, Q, Q, z);
    else if (sideE) quad(out, dx + Q, dy, EDGE_RIGHT[0], Q, Q, z);
    else if (openN) quad(out, dx + Q, dy, EDGE_TOP_R, Q, Q, z);
    else if (diagNE) quad(out, dx + Q, dy, EDGE_RIGHT[0], Q, Q, z);
    // lower quarters (south is never open here — that would make this a face)
    if (sideW) quad(out, dx, dy + Q, EDGE_LEFT[1], Q, Q, z);
    if (sideE) quad(out, dx + Q, dy + Q, EDGE_RIGHT[1], Q, Q, z);
    // The void itself must also cover anyone standing behind this wall row.
    if (z !== undefined) this.overlayPieces.push({ dx, dy, sx: VOID[0], sy: VOID[1], w: SUB, h: SUB, z: z - VOID_BELOW_WALL });
  }

  // ── Arches over openings: corridors through a south face, or out of a room's bottom wall ──

  private readonly addArch = (sx: number, sy: number): void => {
    if (!this.solid(sx, sy) || this.solid(sx + 1, sy)) return;
    let n = 0;
    while (sx + 1 + n < this.W && !this.solid(sx + 1 + n, sy)) n++;
    const ex = sx + 1 + n;
    if (n < ARCH_MIN || n > ARCH_MAX || !this.solid(ex, sy)) return;
    const a = sx + sy * this.W, b = ex + sy * this.W;
    const { faceK, faceH } = this;
    // Opening in a south face, at the cap row of both sides
    const capRow = faceK[a] > 0 && faceK[a] === faceH[a] && faceK[b] === faceH[b] && faceH[a] === faceH[b] && faceH[a] === FACE_MAX;
    // Opening in a wall mass's top edge (room floor directly above both sides)
    const topRow = faceK[a] === 0 && faceK[b] === 0 && !this.solid(sx, sy - 1) && !this.solid(ex, sy - 1)
      && !this.solid(sx + 1, sy - 1) && !this.solid(sx + n, sy - 1);
    if (!capRow && !topRow) return;
    // Only openings that lead on (a corridor), not a notch.
    if (capRow && this.solid(sx + 1, sy - 1)) return;
    if (topRow && this.solid(sx + 1, sy + 1)) return;
    this.lintel(sx, ex, sy, OVERHEAD_Z);
  };

  private lintel(x0: number, x1: number, sy: number, z: number): void {
    const out = this.overlayPieces;
    const y = sy * SUB - LINTEL_LIFT;
    quad(out, x0 * SUB, y, LINTEL_LEFT, SUB, LINTEL_END_H, z);
    for (let x = x0 + 1; x < x1; x++) {
      quad(out, x * SUB, y, [LINTEL_MID_X[(x - x0 - 1) % LINTEL_MID_X.length], LINTEL_Y], SUB, LINTEL_BAR_H, z);
    }
    quad(out, x1 * SUB, y, LINTEL_RIGHT, SUB, LINTEL_END_H, z);
  }
}

export function buildTerrainPieces(level: Level): TerrainPiece[] {
  return new TerrainBuilder(level).build();
}

/** World-space tile columns where a full-height face shows a pillar (no torch there). */
export function isPillarColumn(tx: number): boolean {
  return tx % PILLAR_EVERY === PILLAR_PHASE;
}
