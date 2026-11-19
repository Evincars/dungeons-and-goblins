import { buildMineTerrain } from './MineTerrain';
import { mineFloorSource } from './MineGround';
import { MINE_GROUND } from './MineTiles';
import type { Level } from './Level';
import type { TileData } from './TileType';
import { forEachTile } from './Grid';
import { TileType, TILE_WIDTH, TILE_HEIGHT, UNDER_WALL_INSET } from './TileType';
import { LOBE_E, LOBE_N, LOBE_S, LOBE_W } from './PitShapes';
import {
  CASTLE_ARCH_SPAN, CASTLE_TOP, castleAboveCap, castleArchPieces, castleFaceSource, castleFloor, castlePlinth, poolPiece, spikePitPieces,
  stairsPiece,
} from './CastleTiles';
import type { CastleFaceStyle } from './CastleTiles';
import type { Pit } from './PitShapes';
import { buildIsoTerrain, faceDepth, isoFloorSource, slantFootY, slantRimDepth, voidColumn } from './IsoTerrain';
import { ISO_FLOORS } from './IsoTiles';
import { CASTLE_SLANTS, CATACOMB_SLANTS, northCorner } from './SlantTiles';
import type { SlantArt, SlantSet } from './SlantTiles';
import type { Slope } from './Slopes';
import { SOUTH_WALL_RAISE } from './Theme';
import { CAVE_SHEET, addCavePieces } from './CaveTerrain';

/**
 * One textured quad: draw tileset rect (sx,sy,w,h) at world (dx,dy). Pieces with
 * a `z` are drawn among the entities at that depth (walls characters can stand
 * behind, arch lintels); the rest lie flat beneath everything.
 */
export type TerrainPiece = {
  dx: number; dy: number; sx: number; sy: number; w: number; h: number; z?: number;
  /**
   * Texture the rect is cut from, when not the level's own tileset (Theme.ts tilesetKey): cave ground (or a castle's
   * floors) lie beneath all of it.
   */
  sheet?: string;
  /** A floor tile: drawn under the soft edges where one kind of ground meets another (GroundBlend.ts). */
  floor?: true;
};

/**
 * The kinds of ground a floor tile can be, softest first: where two meet, the softer spills over the edge of the other
 * (cave earth over cobbles, rough earth and mossy patches over stone, corridor stone over the safe room's slabs).
 */
export const GROUND_KINDS = ['heath', 'cave', 'rough', 'patch', 'stone', 'safe'] as const;
export type GroundKind = (typeof GROUND_KINDS)[number];

/** A floor tile's ground: its kind, and the 32×32 rect of the tileset (or the cave sheet) it is drawn from. */
export type Ground = { kind: GroundKind; sx: number; sy: number; sheet?: string };

/** The castle's tileset (/castle/mainlevbuild.png), which a castle's floors are cut from. */
export const CASTLE_TILESET = 'castle_tileset';

/** The cave tileset (/caves/MainLev2.0.png), whose charcoal ground tiles floor the cave halls. */
export const CAVE_GROUND = CAVE_SHEET;

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
const CRACKED_Y = [304, 288, 272];     // damp-stained, crumbling bricks (k=1..3): breakable walls, and stretches of any wall
/**
 * The cobblestone walls' own stretches of the same kind (cols 19–27, rows 21–27): four blocks 4 sub-tiles wide, of big
 * stones, gravestones, stones and rubble set in the cobbles, each three brick rows tall.
 */
const COBBLE_STAINS: ReadonlyArray<Src> = [[304, 336], [384, 336], [304, 400], [384, 400]];
/** One pair of plain full-height face tiles in this many (by hash) is such a stained (or stone-set) stretch. */
const STAINED_EVERY = 4;
/**
 * Other stretches two tiles wide: the face's right-hand panel with its two dark vents (cols 11–14, rows 8–10, and the
 * same in cobblestone), and a dark wall with pale cracks glowing down its sides (cols 23–26, rows 13–15; brick only).
 */
const VENTS_X = 176;
const VENTS_EVERY = 5;
const DARK_X = 368;
const DARK_EVERY = 7;
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
/**
 * Its lobes, and the quatrefoil pit on 2×2 tiles. A lobe's open side lies on the square's inside edge, so it covers the
 * square's rim where they join and its own rim's ends meet the square's; the arched alcove on the north stands over the
 * square's north wall (this tall under its rim), its dark foot meeting the square's dark.
 */
const PIT_NORTH_WALL = 27;
const LOBE_PIECES = {
  north: { x: 640, y: 208, w: 32, h: 48 },
  east: { x: 704, y: 288, w: 16, h: 32 },
  south: { x: 640, y: 352, w: 32, h: 16 },
  west: { x: 592, y: 288, w: 16, h: 32 },
} as const;
const QUATREFOIL = { x: 624, y: 384, w: 64, h: 64 };
// A framed 2×2 drain grate set into the floor, its frame spilling this far past the tiles.
const GRATE = { x: 487, y: 202, w: 82, h: 79, rimX: 9, rimY: 8 };
// The cobblestone walls: the brick face set's rows, this much lower in the tileset (same columns).
const COBBLE_DY = 224;

// Floors (32×32, each window sits on a fully opaque band)
// Main floor: teal cobble variants that share one hue, so they blend seamlessly.
const FLOOR_MAIN: Array<[number, number]> = [
  [832, 272], [880, 272], [832, 320], [880, 320], [832, 368], [880, 368],
];
// Low-frequency patches: mossy cobble, and rarer crumbled earth.
const FLOOR_PATCH: Array<[number, number]> = [[928, 272], [976, 272], [928, 320], [976, 320]];
// Rough patches: the floor set's warm grey flagstones (cols 46–50, rows 17–24), not the cobblestone walls' stones.
const FLOOR_ROUGH: Array<[number, number]> = [[736, 272], [784, 272], [736, 320], [784, 320], [736, 368], [784, 368]];
const FLOOR_SAFE: Array<[number, number]> = [[832, 208]];
const FLOOR_GRATES: Array<[number, number]> = [[496, 288], [496, 336]];

// Cave ground (MainLev2.0.png, charcoal set): bare earth, pebbles, and tufts of blue grass.
const CAVE_PLAIN: Array<[number, number]> = [[0, 1472], [32, 1472], [0, 1504], [32, 1504], [64, 1472], [96, 1472]];
const CAVE_PEBBLES: Array<[number, number]> = [
  [0, 1344], [32, 1344], [64, 1344], [96, 1344], [0, 1376], [32, 1376], [64, 1376], [96, 1376],
];
const CAVE_GRASS: Array<[number, number]> = [[128, 1376], [160, 1376], [192, 1376], [224, 1376], [256, 1376]];
/**
 * The caverns' patches of purplish heath (the inside of the cave set's purple chasm block, cols 36–39, rows 2–4): softer
 * than the bare ground, its edge runs ragged over it (GroundBlend.ts).
 */
const CAVE_HEATH: Array<[number, number]> = [1152, 1184, 1216, 1248].flatMap((x) => [64, 96, 128].map((y): [number, number] => [x, y]));
const HEATH_SCALE = 7;
const HEATH_LEVEL = 0.66;
/** The heath's noise is read this far off the ground's, so the two do not line up. */
const HEATH_SHIFT = 97;

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

/** The framed block's quarters, by theme: the catacombs' (above) or the castle's (CastleTiles.ts). */
const CATACOMB_TOP = {
  outerTL: OUTER_TL, outerTR: OUTER_TR, edgeTopL: EDGE_TOP_L, edgeTopR: EDGE_TOP_R, edgeLeft: EDGE_LEFT, edgeRight: EDGE_RIGHT, void: VOID,
} as const;
type WallTop = { outerTL: Src; outerTR: Src; edgeTopL: Src; edgeTopR: Src; edgeLeft: readonly [Src, Src]; edgeRight: readonly [Src, Src]; void: Src };

/** Tallest a south face gets, in sub-tiles: a cap over three brick rows. */
const FACE_MAX = 4;
/** A wall's edge is run up past another's face to its north edge only if that is at most this many sub-tiles up. */
const SEAM_MAX = 12;
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
/** One castle spike pit in this many (by hash) has a stone slab standing in it. */
const SLAB_EVERY = 2;
/** One floor tile in this many (by hash) is a drain grate. */
const GRATE_EVERY = 53;
/** One plain full-height face column in this many (by hash) shows an arched window. */
const WINDOW_EVERY = 9;
/** One plain full-height castle face tile in this many (by hash) has an arrow slit in one of its halves. */
const SLIT_EVERY = 6;
/**
 * Castle stairs: a north–south passage two tiles wide gets a flight of steps in its middle when it runs between walls
 * for at least STAIRS_MIN_RUN tiles (two flights from STAIRS_DOUBLE_RUN), save one passage in STAIRS_SKIP (by hash).
 */
const STAIRS_MIN_RUN = 4;
const STAIRS_DOUBLE_RUN = 7;
const STAIRS_SKIP = 3;
/** The void that covers characters behind a wall row sorts just under the wall row itself. */
const VOID_BELOW_WALL = 0.5;
/**
 * Arched pieces on slanted faces (SlantTiles.ts), placed by hash and never at a slant's ends: one slope tile in
 * SLANT_WIDE_EVERY starts a two-tile one (a niche, an alcove), one in SLANT_NARROW_EVERY holds a one-tile window.
 */
const SLANT_WIDE_EVERY = 3;
/** Under a south slant the floor run on under the wall is laid in strips this wide, each as deep as the slant there. */
const UNDER_SLANT_STRIP = 2;
const SLANT_NARROW_EVERY = 3;

type FaceStyle = 'left' | 'right' | 'mid' | 'pillarL' | 'pillarR' | 'window' | 'slit' | 'cracked' | 'vents' | 'dark' | 'niche' | 'decor';
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
  /**
   * Sub-tiles a slanted face's end column stands in (where the slant ends with no face running on): the wall beside it
   * runs its rim up along it, as it does along a straight face's end.
   */
  private readonly endColumns = new Set<number>();
  /**
   * Wall-top sub-tiles whose west (seamW) or east (seamE) side runs the rim on up from the top of a face beside it to the
   * wall's north edge: where a wall juts out past another's face, its edge goes all the way up instead of stopping in the
   * dark at the other face's cap.
   */
  private readonly seamW = new Set<number>();
  private readonly seamE = new Set<number>();
  readonly floorPieces: TerrainPiece[] = [];
  readonly wallPieces: TerrainPiece[] = [];
  readonly overlayPieces: TerrainPiece[] = [];

  /** A castle (its own tileset and pieces), or the catacombs. */
  private readonly castle: boolean;
  private readonly top: WallTop;
  private readonly slants: SlantSet;
  /** How far a south wall is drawn up over the floor north of it (Theme.ts). */
  private readonly raise: number;

  constructor(private readonly level: Level) {
    this.raise = SOUTH_WALL_RAISE[level.theme];
    this.castle = level.theme === 'castle';
    this.top = this.castle ? CASTLE_TOP : CATACOMB_TOP;
    this.slants = this.castle ? CASTLE_SLANTS : CATACOMB_SLANTS;
    this.W = level.width * 2;
    this.H = level.height * 2;
    this.faceK = new Int8Array(this.W * this.H);
    this.faceH = new Int8Array(this.W * this.H);
  }

  build(): TerrainPiece[] {
    forEachTile(0, 1, this.W - 1, this.H - 1, this.markFace);
    for (const index of this.level.slopes.keys()) this.markSlantEnds(index % this.level.width, Math.floor(index / this.level.width));
    forEachTile(0, 1, this.W - 1, this.H - 1, this.markSeams);
    forEachTile(0, 0, this.level.width - 1, this.level.height - 1, this.addFloor);
    for (const p of this.level.pits) this.addPit(p);
    for (const g of this.level.grates) this.addGrate(g);
    for (const pool of this.level.pools) this.overlayPieces.push(poolPiece(pool));
    forEachTile(0, 0, this.W - 1, this.H - 1, this.addSubTile);
    for (const index of this.level.slopes.keys()) {
      if (!this.level.caveZone.has(index)) this.addSlant(index % this.level.width, Math.floor(index / this.level.width));
    }
    forEachTile(0, 0, this.W - 3, this.H - 1, this.addArch);
    if (this.level.caveZone.size > 0) addCavePieces(this.level, this.floorPieces, this.wallPieces);
    if (this.castle) forEachTile(1, 1, this.level.width - 3, this.level.height - 2, this.addStairs);
    return [...this.floorPieces, ...this.wallPieces, ...this.overlayPieces];
  }

  // ── Sub-tile queries ───────────────────────────────────────────────────────

  private tileAt(sx: number, sy: number): TileData | null {
    return sx < 0 || sy < 0 || sx >= this.W || sy >= this.H ? null : this.level.getTile(sx >> 1, sy >> 1);
  }

  /** A wall sub-tile, or one of a slanted wall's tiles (drawn whole by addSlant: nothing else is drawn on or for it). */
  private solid(sx: number, sy: number): boolean {
    const t = this.tileAt(sx, sy);
    return !t || t.type === TileType.Wall || t.type === TileType.BreakableWall || this.sloped(sx, sy);
  }

  private sloped(sx: number, sy: number): boolean {
    return this.level.slopes.has((sx >> 1) + (sy >> 1) * this.level.width);
  }

  private hole(sx: number, sy: number): boolean {
    return this.tileAt(sx, sy)?.type === TileType.Hole;
  }

  private isFace(sx: number, sy: number): boolean {
    return sx >= 0 && sy >= 0 && sx < this.W && sy < this.H && this.faceK[sx + sy * this.W] > 0;
  }

  /** A face sub-tile, or one a slanted face's end column stands in: the wall beside either shows its rim. */
  private faceBeside(sx: number, sy: number): boolean {
    return this.isFace(sx, sy) || this.endColumns.has(sx + sy * this.W);
  }

  /**
   * Depth of a wall sub-tile whose tile has floor directly north (drawn over characters there): walkable floor, or floor
   * something stands on (a pot, a crate, a closed portcullis), so the wall is drawn the same whatever stands before it;
   * none under a slanted wall.
   */
  private occluderZ(sx: number, sy: number): number | undefined {
    const tx = sx >> 1, ty = sy >> 1;
    const north = this.level.getTile(tx, ty - 1);
    if (!north || !(north.passable || north.type === TileType.Obstacle)) return undefined;
    // Under a slanted wall the slant's own rim and the dark under it stand for this wall's top (addSlant): a raised top
    // here would cut a notch into the rim where the slant steps down a row.
    if (this.level.slopes.has(tx + (ty - 1) * this.level.width)) return undefined;
    return (ty + 1) * TILE_HEIGHT;
  }

  // ── Faces: up to 4 solid sub-tiles directly above an open one ──────────────

  private readonly markFace = (sx: number, sy: number): void => {
    // Floor under a slanted wall has its face on the slant (addSlant), not a straight one.
    if (this.solid(sx, sy) || !this.solid(sx, sy - 1) || this.sloped(sx, sy - 1)) return;
    let t = 0;
    while (t < FACE_MAX && this.solid(sx, sy - 1 - t) && !this.sloped(sx, sy - 1 - t)) t++;
    for (let k = 1; k <= t; k++) {
      const y = sy - k;
      if (y < 0) break;
      this.faceK[sx + y * this.W] = k;
      this.faceH[sx + y * this.W] = t;
    }
  };

  /**
   * Whether the sub-tile beside a face is another wall's face standing further north (its foot higher up): this face
   * juts out past it, so it ends there with its edge, all the way up, as where it ends beside open floor.
   */
  private shallowerFace(sx: number, sy: number, bottom: number): boolean {
    return this.isFace(sx, sy) && sy + this.faceK[sx + sy * this.W] - 1 < bottom;
  }

  /** A plain wall-top sub-tile: solid, no face, no slant. */
  private wallTop(sx: number, sy: number): boolean {
    return this.solid(sx, sy) && !this.isFace(sx, sy) && !this.sloped(sx, sy);
  }

  private readonly markSeams = (sx: number, sy: number): void => {
    this.markSeam(sx, sy, -1, this.seamW);
    this.markSeam(sx, sy, 1, this.seamE);
  };

  /**
   * From a wall-top sub-tile beside the cap of a face (on `side`), the sub-tiles above it whose side meets the other wall's
   * top, up to where either wall reaches open floor north: marked only if it gets there within SEAM_MAX (a rim left
   * hanging in the dark would be no better).
   */
  private markSeam(sx: number, sy: number, side: -1 | 1, seams: Set<number>): void {
    const beside = sx + side;
    if (!this.wallTop(sx, sy) || !this.isFace(beside, sy) || this.isFace(beside, sy - 1)) return;
    const run: number[] = [];
    for (let y = sy - 1; y >= 0 && run.length < SEAM_MAX; y--) {
      if (!this.wallTop(sx, y) || !this.wallTop(beside, y)) return;
      run.push(sx + y * this.W);
      if (this.solid(sx, y - 1) && this.solid(beside, y - 1)) continue;
      for (const i of run) seams.add(i);
      return;
    }
  }

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
    // A face ends with its edge where the caverns' rock takes over, as beside open floor.
    if (!this.solid(sx - 1, sy) || this.shallowerFace(sx - 1, sy, bottom) || this.inCaves(sx - 1, sy)) return 'left';
    if (!this.solid(sx + 1, sy) || this.shallowerFace(sx + 1, sy, bottom) || this.inCaves(sx + 1, sy)) return 'right';
    if (!this.castle && this.tileAt(sx, sy)?.type === TileType.BreakableWall) return 'cracked';
    const tx = sx >> 1;
    const full = h === FACE_MAX;
    const decor = full ? this.level.wallDecor.get(tx + (bottom >> 1) * this.level.width) : undefined;
    if (decor) return this.castle ? 'decor' : 'niche';
    if (full && tx % PILLAR_EVERY === PILLAR_PHASE && this.pillarFits(tx, bottom)) return sx === tx * 2 ? 'pillarL' : 'pillarR';
    if (full && this.castle) return this.castleBareStyle(sx, bottom);
    if (full && hash(tx, bottom) % WINDOW_EVERY === 0) return 'window';
    // Now and then a stretch two tiles wide is damp-stained (or, in cobblestone, set with stones).
    const stretch = hash(tx >> 1, bottom);
    if (full && (stretch >>> 5) % STAINED_EVERY === 0) return 'cracked';
    if (full && (stretch >>> 9) % VENTS_EVERY === 0) return 'vents';
    if (full && !this.cobble(sx, sy) && (stretch >>> 13) % DARK_EVERY === 0) return 'dark';
    return 'mid';
  }

  /**
   * A castle's full face where nothing else stands: a pilaster framing a decorated stretch beside it (as the great
   * windows are framed), a narrow window, an arrow slit in one half of the tile, or plain stone.
   */
  private castleBareStyle(sx: number, bottom: number): FaceStyle {
    if (this.flanksDecor(sx, bottom)) return 'pillarL';
    // The other half of a tile with a pilaster stays plain: a window there would be cut in two.
    if (this.flanksDecor(sx ^ 1, bottom)) return 'mid';
    const v = hash(sx >> 1, bottom);
    if (v % WINDOW_EVERY === 0) return 'window';
    const slitHalf = (v >>> 4) & 1;
    if ((v >>> 8) % SLIT_EVERY === 0 && (sx & 1) === slitHalf) return 'slit';
    return 'mid';
  }

  /** Whether a face sub-tile stands right beside a decorated stretch of the castle's face (not in it). */
  private flanksDecor(sx: number, bottom: number): boolean {
    const row = (bottom >> 1) * this.level.width;
    const decorAt = (x: number): boolean => this.level.wallDecor.has((x >> 1) + row);
    return !decorAt(sx) && (decorAt(sx - 1) || decorAt(sx + 1));
  }

  // ── Floors (per 32px game tile; obstacles stand on floor) ──────────────────

  private readonly addFloor = (tx: number, ty: number): void => {
    const ground = groundAt(this.level, tx, ty);
    if (!ground) {
      this.addFloorUnderWall(tx, ty);
      return;
    }
    const piece: TerrainPiece = { dx: tx * TILE_WIDTH, dy: ty * TILE_HEIGHT, sx: ground.sx, sy: ground.sy, w: TILE_WIDTH, h: TILE_HEIGHT, floor: true };
    if (ground.sheet) piece.sheet = ground.sheet;
    this.floorPieces.push(piece);
  };

  /**
   * The floor of the room north of a south wall, run on under the wall as far as its dark reaches (the whole tile under a
   * straight wall; under a slanted one, down along the slant, a few pixels' strip at a time, so where the wall clears its
   * floor ends on the slant, not in steps): what shows where the wall clears over someone behind it
   * (render/SeeThrough.ts).
   */
  private addFloorUnderWall(tx: number, ty: number): void {
    const tile = this.level.getTile(tx, ty);
    if (!tile || (tile.type !== TileType.Wall && tile.type !== TileType.BreakableWall)) return;
    const slope = this.level.slopes.get(tx + (ty - 1) * this.level.width);
    const southSlant = !!slope && !northCorner(slope.corner);
    const above = groundAt(this.level, tx, ty - 1);
    if (!above || (slope && !southSlant)) return;
    if (!slope) {
      this.addUnderWallStrip(above, tx * TILE_WIDTH, ty * TILE_HEIGHT, 0, TILE_WIDTH, TILE_HEIGHT - UNDER_WALL_INSET);
      return;
    }
    // The dark under the rim reaches WALL_SINK (and a little) past the slant, column by column.
    const left = slantFootY(slope, tx, ty - 1, false);
    const right = slantFootY(slope, tx, ty - 1, true);
    const reachBelowFoot = slantRimDepth(slope, tx, ty - 1) - Math.max(left, right);
    for (let x = 0; x < TILE_WIDTH; x += UNDER_SLANT_STRIP) {
      const foot = left + ((right - left) * (x + UNDER_SLANT_STRIP / 2)) / TILE_WIDTH;
      const h = Math.min(TILE_HEIGHT, Math.round(foot + reachBelowFoot) - ty * TILE_HEIGHT) - UNDER_WALL_INSET;
      this.addUnderWallStrip(above, tx * TILE_WIDTH, ty * TILE_HEIGHT, x, UNDER_SLANT_STRIP, h);
    }
  }

  /** A strip of the floor run on under a wall: `x` px in from the tile's left, this wide and tall. */
  private addUnderWallStrip(ground: Ground, dx: number, dy: number, x: number, w: number, h: number): void {
    if (h <= 0) return;
    const piece: TerrainPiece = { dx: dx + x, dy, sx: ground.sx + x, sy: ground.sy, w, h, floor: true };
    if (ground.sheet) piece.sheet = ground.sheet;
    this.floorPieces.push(piece);
  }

  // ── Shaped pits on 2×2 holes — rims and lobes spill onto the surrounding floor ──

  private addPit(p: Pit): void {
    forEachTile(0, 0, PIT_SUBTILES - 1, PIT_SUBTILES - 1, (dx, dy) => this.framed.add(p.x * 2 + dx + (p.y * 2 + dy) * this.W));
    const x = p.x * TILE_WIDTH;
    const y = p.y * TILE_HEIGHT;
    if (p.shape === 'spikes') {
      forEachTile(0, 0, 7, 3, (dx, dy) => this.framed.add(p.x * 2 + dx + (p.y * 2 + dy) * this.W));
      for (const piece of spikePitPieces(p.x, p.y, hash(p.x, p.y) % SLAB_EVERY === 0)) this.overlayPieces.push(piece);
      return;
    }
    if (p.shape === 'quatrefoil') {
      this.overlayPieces.push({ dx: x, dy: y, sx: QUATREFOIL.x, sy: QUATREFOIL.y, w: QUATREFOIL.w, h: QUATREFOIL.h });
      return;
    }
    this.overlayPieces.push({ dx: x - PIT.rim, dy: y - PIT.rim, sx: PIT.x, sy: PIT.y, w: PIT.w, h: PIT.h });
    if (p.shape === 'lobed') this.addLobes(p.lobes, x, y);
  }

  /** A lobed pit's lobes, each laid over the square's rim where they join so the two read as one hole. */
  private addLobes(lobes: number, x: number, y: number): void {
    const side = 2 * TILE_WIDTH;
    const { north, east, south, west } = LOBE_PIECES;
    const lobe = (piece: { x: number; y: number; w: number; h: number }, dx: number, dy: number): void => {
      this.overlayPieces.push({ dx, dy, sx: piece.x, sy: piece.y, w: piece.w, h: piece.h });
    };
    if (lobes & LOBE_N) lobe(north, x + (side - north.w) / 2, y + PIT_NORTH_WALL - north.h);
    if (lobes & LOBE_E) lobe(east, x + side, y + (side - east.h) / 2);
    if (lobes & LOBE_S) lobe(south, x + (side - south.w) / 2, y + side);
    if (lobes & LOBE_W) lobe(west, x - west.w, y + (side - west.h) / 2);
  }

  /** A framed drain grate over 2×2 floor tiles, its frame spilling onto the floor round it. */
  private addGrate(g: { x: number; y: number }): void {
    this.overlayPieces.push({
      dx: g.x * TILE_WIDTH - GRATE.rimX, dy: g.y * TILE_HEIGHT - GRATE.rimY, sx: GRATE.x, sy: GRATE.y, w: GRATE.w, h: GRATE.h,
    });
  }

  // ── Walls, loose holes and plinths (per 16px sub-tile) ─────────────────────

  /** Whether a sub-tile lies in the caverns (drawn by CaveTerrain.ts, not here). */
  private inCaves(sx: number, sy: number): boolean {
    return this.level.caveZone.has((sx >> 1) + (sy >> 1) * this.level.width);
  }

  private readonly addSubTile = (sx: number, sy: number): void => {
    const dx = sx * SUB;
    const dy = sy * SUB;
    if (this.sloped(sx, sy) || this.inCaves(sx, sy)) return;
    if (!this.solid(sx, sy)) {
      this.addOpenSubTile(sx, sy, dx, dy);
      return;
    }
    const z = this.occluderZ(sx, sy);
    if (this.faceK[sx + sy * this.W] === 0 && z !== undefined && this.raise > 0) this.addRaisedWallTop(sx, sy, dx, dy, z);
    else if (this.faceK[sx + sy * this.W] === 0) this.addWallTop(sx, sy, dx, dy, z);
    else if (this.castle) this.addCastleFace(sx, sy, dx, dy, z);
    else quad(this.wallPieces, dx, dy, this.faceSource(sx, sy), SUB, SUB, z);
  };

  /** The castle's face style for a sub-tile (the castle has no cracked walls or tomb niches; decor is its own). */
  private castleStyle(sx: number, sy: number): CastleFaceStyle {
    const style = this.faceStyle(sx, sy);
    return style === 'cracked' || style === 'vents' || style === 'dark' || style === 'niche' ? 'mid' : style;
  }

  /** The decor of the wall tile a face sub-tile belongs to (decor is keyed by the face's foot tile). */
  private faceDecor(sx: number, sy: number): ReturnType<Level['wallDecor']['get']> {
    const bottom = sy + this.faceK[sx + sy * this.W] - 1;
    return this.level.wallDecor.get((sx >> 1) + (bottom >> 1) * this.level.width);
  }

  /** A castle face sub-tile, and on its cap row whatever stands proud of it (a pilaster's top, a great window's gable). */
  private addCastleFace(sx: number, sy: number, dx: number, dy: number, z: number | undefined): void {
    const i = sx + sy * this.W;
    const k = this.faceK[i];
    const cap = k === this.faceH[i];
    const style = this.castleStyle(sx, sy);
    const decor = this.faceDecor(sx, sy);
    // The variant is keyed by the face's foot, so every row of a window or slit picks the same art.
    const variant = hash(sx >> 1, sy + k - 1);
    quad(this.wallPieces, dx, dy, castleFaceSource(style, sx, k, cap, decor, variant), SUB, SUB, z);
    if (!cap || this.faceH[i] !== FACE_MAX) return;
    for (const [src, up] of castleAboveCap(style, sx, decor)) quad(this.wallPieces, dx, dy - up * SUB, src, SUB, SUB, z);
  }

  private addOpenSubTile(sx: number, sy: number, dx: number, dy: number): void {
    // Plinth along the foot of a face, laid over the floor
    if (!this.hole(sx, sy) && this.isFace(sx, sy - 1) && this.faceK[sx + (sy - 1) * this.W] === 1) this.addPlinth(sx, sy, dx, dy);
    // A hole outside a framed pit: dark brick lip under open floor, then black
    if (!this.hole(sx, sy) || this.framed.has(sx + sy * this.W)) return;
    const floorAbove = (y: number) => !this.solid(sx, y) && !this.hole(sx, y);
    if (floorAbove(sy - 1)) quad(this.wallPieces, dx, dy, PIT_WALL[0], SUB, SUB);
    else if (this.hole(sx, sy - 1) && floorAbove(sy - 2)) quad(this.wallPieces, dx, dy, PIT_WALL[1], SUB, SUB);
  }

  /** The plinth along a face's foot, on the floor sub-tile under it (a castle pilaster's base is taller). */
  private addPlinth(sx: number, sy: number, dx: number, dy: number): void {
    if (this.castle) {
      const { src, h } = castlePlinth(this.castleStyle(sx, sy - 1), sx);
      quad(this.overlayPieces, dx, dy, src, SUB, h);
      return;
    }
    const base = BASE_Y + (this.cobble(sx, sy - 1) ? COBBLE_DY : 0);
    quad(this.overlayPieces, dx, dy, [plinthX(this.faceStyle(sx, sy - 1)), base], SUB, Q);
  }

  /** Whether the wall a face sub-tile belongs to is cobblestone (its room's material) rather than brick. */
  private cobble(sx: number, sy: number): boolean {
    return this.level.cobbleWalls.has((sx >> 1) + (sy >> 1) * this.level.width);
  }

  /** The face's art: brick, or the same piece from the cobblestone set (which has no windows). */
  private faceSource(sx: number, sy: number): Src {
    const src = this.brickFaceSource(sx, sy);
    if (!this.cobble(sx, sy)) return src;
    const style = this.faceStyle(sx, sy);
    if (style === 'cracked') return this.cobbleStainSource(sx, sy);
    if (style === 'window') return [FACE_MID_X[sx % 4], this.brickRowY(sx, sy) + COBBLE_DY];
    return [src[0], src[1] + COBBLE_DY];
  }

  /**
   * A stained stretch of a cobblestone face: its cap as any other's; below it one of the stone-set blocks, picked for the
   * stretch (two tiles) by hash, its columns running on across the stretch.
   */
  private cobbleStainSource(sx: number, sy: number): Src {
    const i = sx + sy * this.W;
    const k = this.faceK[i];
    if (k === this.faceH[i]) return [FACE_MID_X[sx % 4], FACE_CAP_Y + COBBLE_DY];
    const bottom = sy + k - 1;
    const block = COBBLE_STAINS[hash(sx >> 2, bottom >> 1) % COBBLE_STAINS.length];
    return [block[0] + (sx % 4) * SUB, block[1] + (FACE_MAX - 1 - k) * SUB];
  }

  /** The brick face row a face sub-tile shows: the cap at its top, plain bricks below. */
  private brickRowY(sx: number, sy: number): number {
    const i = sx + sy * this.W;
    const k = this.faceK[i];
    return k === this.faceH[i] ? FACE_CAP_Y : FACE_BRICK_Y[k - 1];
  }

  private brickFaceSource(sx: number, sy: number): Src {
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
      case 'vents': return [VENTS_X + (sx % 4) * SUB, brick];
      case 'dark': return cap ? [FACE_MID_X[sx % 4], FACE_CAP_Y] : [DARK_X + (sx % 4) * SUB, WINDOW_Y[k - 1]];
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
    const t = this.top;
    const openN = !this.solid(sx, sy - 1);
    const i = sx + sy * this.W;
    const sideW = !this.solid(sx - 1, sy) || this.faceBeside(sx - 1, sy) || this.seamW.has(i) || this.inCaves(sx - 1, sy);
    const sideE = !this.solid(sx + 1, sy) || this.faceBeside(sx + 1, sy) || this.seamE.has(i) || this.inCaves(sx + 1, sy);
    // A corner nub where floor touches only diagonally, unless the wall beside it is a raised south wall (its rim, drawn
    // higher, meets this side's rim on its own).
    const diagNW = !this.solid(sx - 1, sy - 1) && !this.raisedRim(sx - 1, sy);
    const diagNE = !this.solid(sx + 1, sy - 1) && !this.raisedRim(sx + 1, sy);
    // A side's rim stops short over the raised rim of a south slant starting beside it.
    const lowW = sideW && !this.raisedSlantBelow(sx - 1, sy);
    const lowE = sideE && !this.raisedSlantBelow(sx + 1, sy);

    // upper-left quarter
    if (sideW && openN) quad(out, dx, dy, t.outerTL, Q, Q, z);
    else if (sideW) quad(out, dx, dy, t.edgeLeft[0], Q, Q, z);
    else if (openN) quad(out, dx, dy, t.edgeTopL, Q, Q, z);
    else if (diagNW) quad(out, dx, dy, t.edgeLeft[0], Q, Q, z);
    // upper-right quarter
    if (sideE && openN) quad(out, dx + Q, dy, t.outerTR, Q, Q, z);
    else if (sideE) quad(out, dx + Q, dy, t.edgeRight[0], Q, Q, z);
    else if (openN) quad(out, dx + Q, dy, t.edgeTopR, Q, Q, z);
    else if (diagNE) quad(out, dx + Q, dy, t.edgeRight[0], Q, Q, z);
    // lower quarters (south is never open here — that would make this a face)
    if (lowW) quad(out, dx, dy + Q, t.edgeLeft[1], Q, Q, z);
    if (lowE) quad(out, dx + Q, dy + Q, t.edgeRight[1], Q, Q, z);
    // The void itself must also cover anyone standing behind this wall row.
    if (z !== undefined) this.overlayPieces.push({ dx, dy, sx: t.void[0], sy: t.void[1], w: SUB, h: SUB, z: z - VOID_BELOW_WALL });
  }

  /**
   * Whether a sub-tile is drawn under a raised rim (SOUTH_WALL_RAISE): the top of a room's south wall (a wall top with
   * floor north), or a south slant's.
   */
  private raisedRim(sx: number, sy: number): boolean {
    if (this.raise === 0) return false;
    if (this.sloped(sx, sy)) return this.raisedSlantBelow(sx, sy - 1);
    return this.solid(sx, sy) && !this.isFace(sx, sy) && !this.solid(sx, sy - 1);
  }

  /** Whether the sub-tile under (sx, sy) lies on a south slant, whose rim is drawn raised. */
  private raisedSlantBelow(sx: number, sy: number): boolean {
    const slope = this.level.slopes.get((sx >> 1) + ((sy + 1) >> 1) * this.level.width);
    return this.raise > 0 && !!slope && !northCorner(slope.corner);
  }

  /**
   * A sub-tile of a room's south wall, drawn SOUTH_WALL_RAISE up over the floor north of it: its outline and dark moved
   * up, and at the wall tile's foot the dark (and the outline down its sides) run on to fill the gap that leaves.
   */
  private addRaisedWallTop(sx: number, sy: number, dx: number, dy: number, z: number): void {
    const lift = this.raise;
    this.addWallTop(sx, sy, dx, dy - lift, z);
    if ((sy & 1) === 0) return;
    const t = this.top;
    const y = dy + SUB - lift;
    quad(this.overlayPieces, dx, y, t.void, SUB, lift, z - VOID_BELOW_WALL);
    if (!this.solid(sx - 1, sy) || this.isFace(sx - 1, sy)) quad(this.wallPieces, dx, y, t.edgeLeft[1], Q, lift, z);
    if (!this.solid(sx + 1, sy) || this.isFace(sx + 1, sy)) quad(this.wallPieces, dx + Q, y, t.edgeRight[1], Q, lift, z);
  }

  // ── Slanted walls (Slopes.ts), from the slanted pieces of the tileset's -isometric copy (SlantTiles.ts) ──

  /**
   * A slanted wall's tile: its column of the slanted face (north corners) — now and then an arched piece set into it — or
   * of the rim along the slant (south ones), drawn over whoever stands behind it with the dark under it.
   */
  private addSlant(tx: number, ty: number): void {
    const slope = this.level.slopes.get(tx + ty * this.level.width);
    if (!slope) return;
    const dx = tx * TILE_WIDTH;
    const footLeft = slantFootY(slope, tx, ty, false);
    const corner = slope.corner;
    if (!northCorner(corner)) {
      const rim = this.slants.rim[corner];
      const z = slantRimDepth(slope, tx, ty);
      const top = footLeft - this.raise - rim.footLeft + rim.solidH;
      this.overlayPieces.push(slantPiece(rim, dx, footLeft - this.raise, z));
      voidColumn(this.overlayPieces, this.slants.void, dx, top, z, z);
      // The edge runs from the rim's own line (where the slant crosses the tile's side) down.
      this.slantSideEdges(tx, ty, Math.min(footLeft, slantFootY(slope, tx, ty, true)) - this.raise, z);
      return;
    }
    // Drawn among the entities, in front of the dark of whatever lies north of it, a tile's column at a time (an arched
    // piece two tiles wide may span two rows of the slant).
    const art = this.slantFaceArt(slope, corner, tx, ty);
    if (!art) return;
    const top = footLeft - art.footLeft;
    for (let i = 0; i * TILE_WIDTH < art.w; i++) {
      const row = i === 0 ? ty : this.slantNeighbour(slope, tx + i - 1, ty, 1);
      const z = faceDepth(row < 0 ? ty : row);
      this.wallPieces.push({ dx: dx + i * TILE_WIDTH, dy: top, sx: art.x + i * TILE_WIDTH, sy: art.y, w: TILE_WIDTH, h: art.h, z });
    }
    // Where the slant ends with no face running on from it, the face is ended as a straight one is, with its end column.
    const z = faceDepth(ty);
    if (this.slantEnds(slope, tx, ty, -1)) this.addFaceEnd('left', dx, footLeft, z, tx, ty);
    if (this.slantEnds(slope, tx, ty, 1)) this.addFaceEnd('right', dx + TILE_WIDTH - SUB, slantFootY(slope, tx, ty, true), z, tx, ty);
  }

  /**
   * Where a south slant ends beside open floor (west or east of its tile), the dark under its rim is edged on that side as
   * a wall's top is, from the rim down: else it would read as a hole in the floor.
   */
  private slantSideEdges(tx: number, ty: number, top: number, bottom: number): void {
    const t = this.top;
    for (const side of [-1, 1] as const) {
      const beside = this.level.getTile(tx + side, ty);
      const open = !!beside && (beside.passable || beside.type === TileType.Obstacle) && !this.level.slopes.has(tx + side + ty * this.level.width);
      if (!open) continue;
      const x = side < 0 ? tx * TILE_WIDTH : (tx + 1) * TILE_WIDTH - Q;
      const src = side < 0 ? t.edgeLeft[0] : t.edgeRight[0];
      for (let y = top; y < bottom; y += Q) quad(this.overlayPieces, x, y, src, Q, Math.min(Q, bottom - y), bottom);
    }
  }

  /** Notes the sub-tiles a north slope tile's end columns (if its slant ends there) will stand in. */
  private markSlantEnds(tx: number, ty: number): void {
    const slope = this.level.slopes.get(tx + ty * this.level.width);
    if (!slope || !northCorner(slope.corner)) return;
    for (const side of [-1, 1] as const) {
      if (!this.slantEnds(slope, tx, ty, side)) continue;
      const sx = tx * 2 + (side < 0 ? 0 : 1);
      const footRow = slantFootY(slope, tx, ty, side > 0) / SUB;
      for (let k = 1; k <= FACE_MAX; k++) this.endColumns.add(sx + (footRow - k) * this.W);
    }
  }

  /**
   * Whether a slanted face ends at slope tile (tx, ty) on the side `dx` (−1 west, 1 east): no slant runs on, nor a
   * straight face standing on the same foot (the slant's end meets a face's foot, the tile row above it where the slant
   * climbs to its end).
   */
  private slantEnds(slope: Slope, tx: number, ty: number, dx: -1 | 1): boolean {
    if (this.slantNeighbour(slope, tx, ty, dx) >= 0) return false;
    const sx = (tx + dx) * 2 + (dx < 0 ? 1 : 0);
    const footRow = slantFootY(slope, tx, ty, dx > 0) / SUB;
    return this.faceK[sx + (footRow - 1) * this.W] !== 1;
  }

  /** A face's end column (a sub-tile wide) standing at x with its foot at `foot`, and its plinth under it. */
  private addFaceEnd(style: 'left' | 'right', x: number, foot: number, z: number, tx: number, ty: number): void {
    const cobble = !this.castle && this.level.cobbleWalls.has(tx + ty * this.level.width);
    for (let k = FACE_MAX; k >= 1; k--) {
      const cap = k === FACE_MAX;
      const src: Src = this.castle
        ? castleFaceSource(style, x / SUB, k, cap, undefined, 0)
        : [style === 'left' ? FACE_LEFT_X : FACE_RIGHT_X, (cap ? FACE_CAP_Y : FACE_BRICK_Y[k - 1]) + (cobble ? COBBLE_DY : 0)];
      quad(this.wallPieces, x, foot - k * SUB, src, SUB, SUB, z);
    }
    if (this.castle) {
      const { src, h } = castlePlinth(style, x / SUB);
      quad(this.wallPieces, x, foot, src, SUB, h, z);
      return;
    }
    quad(this.wallPieces, x, foot, [plinthX(style), BASE_Y + (cobble ? COBBLE_DY : 0)], SUB, Q, z);
  }

  /** The art a north slope tile shows: an arched piece starting there, its plain face, or none (a wide piece's second tile). */
  private slantFaceArt(slope: Slope, corner: 'nw' | 'ne', tx: number, ty: number): SlantArt | null {
    const before = this.slantNeighbour(slope, tx, ty, -1);
    if (before >= 0 && this.wideStarts(slope, tx - 1, before)) return null;
    if (this.wideStarts(slope, tx, ty)) return this.slants.wide[corner];
    const after = this.slantNeighbour(slope, tx, ty, 1);
    const inner = before >= 0 && after >= 0 && !this.wideStarts(slope, tx + 1, after);
    if (inner && (tx & 1) === 1 && hash(tx, ty) % SLANT_NARROW_EVERY === 0) return this.slants.narrow[corner];
    const cobble = this.level.cobbleWalls.has(tx + ty * this.level.width) || this.level.cobbleWalls.has(tx + (ty - 1) * this.level.width);
    const set = cobble && this.slants.cobble ? this.slants.cobble : this.slants.face;
    return set[corner][tx & 1];
  }

  /**
   * Whether a two-tile arched piece starts at slope tile (tx, ty): an even column, by hash, with the slant running on a
   * tile before it and after it (it never reaches a slant's end) and no other one just before it.
   */
  private wideStarts(slope: Slope, tx: number, ty: number): boolean {
    if ((tx & 1) !== 0 || hash(tx, ty) % SLANT_WIDE_EVERY !== 0) return false;
    const second = this.slantNeighbour(slope, tx, ty, 1);
    const before = this.slantNeighbour(slope, tx, ty, -1);
    if (second < 0 || before < 0 || this.slantNeighbour(slope, tx + 1, second, 1) < 0) return false;
    const twoBefore = this.slantNeighbour(slope, tx - 1, before, -1);
    return twoBefore < 0 || (tx - 2) % 2 !== 0 || hash(tx - 2, twoBefore) % SLANT_WIDE_EVERY !== 0;
  }

  /** The row of the slope tile of the same slant in the column `dx` from tx (it lies a row up, level or down), or -1. */
  private slantNeighbour(slope: Slope, tx: number, ty: number, dx: number): number {
    for (let y = ty - 1; y <= ty + 1; y++) {
      if (this.level.slopes.get(tx + dx + y * this.level.width)?.corner === slope.corner) return y;
    }
    return -1;
  }

  // ── Arches over openings: corridors through a south face, or out of a room's bottom wall ──

  private readonly addArch = (sx: number, sy: number): void => {
    if (!this.solid(sx, sy) || this.solid(sx + 1, sy) || this.inCaves(sx, sy)) return;
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
    if (this.castle) this.castleArch(sx, n, sy, capRow);
    else this.lintel(sx, ex, sy, OVERHEAD_Z);
  };

  /**
   * A castle passage through a face two tiles wide gets the great stone arch, its legs on the faces either side (not
   * over the passage) and its feet on the floor; other openings stand bare.
   */
  private castleArch(sx: number, n: number, sy: number, capRow: boolean): void {
    if (!capRow || n !== CASTLE_ARCH_SPAN) return;
    for (const piece of castleArchPieces((sx + 1) * SUB, (sy + FACE_MAX) * SUB)) this.overlayPieces.push(piece);
  }

  // ── Stairs in the castle's north–south passages ────────────────────────────

  /** At the top of each run of passage rows, a flight of stairs (or two) in the run's middle, if it is long enough. */
  private readonly addStairs = (tx: number, ty: number): void => {
    if (!this.passageRow(tx, ty) || this.passageRow(tx, ty - 1)) return;
    let n = 1;
    while (this.passageRow(tx, ty + n)) n++;
    if (n < STAIRS_MIN_RUN || hash(tx, ty) % STAIRS_SKIP === 0) return;
    const flights = n >= STAIRS_DOUBLE_RUN ? 2 : 1;
    const top = ty + Math.floor((n - flights) / 2);
    for (let i = 0; i < flights; i++) this.overlayPieces.push(stairsPiece(tx, top + i));
  };

  /** Whether tiles tx and tx + 1 of row ty are a passage two tiles wide: open floor between walls. */
  private passageRow(tx: number, ty: number): boolean {
    const open = (x: number): boolean => this.level.getTile(x, ty)?.type === TileType.Floor && !this.level.isSafeZone(x, ty)
      && !this.level.slopes.has(x + ty * this.level.width);
    return open(tx) && open(tx + 1) && this.solid(tx * 2 - 1, ty * 2) && this.solid((tx + 2) * 2, ty * 2);
  }

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

/** A slanted piece laid along the slant whose foot crosses its tile's left edge at `footLeft` (world y). */
function slantPiece(art: SlantArt, dx: number, footLeft: number, z?: number): TerrainPiece {
  const piece: TerrainPiece = { dx, dy: footLeft - art.footLeft, sx: art.x, sy: art.y, w: art.w, h: art.h };
  if (z !== undefined) piece.z = z;
  return piece;
}

/** In a cave hall, patches of the floor are cave ground: bare, pebbly or grassy; in the caverns all of it is. */
function caveGround(level: Level, tx: number, ty: number): Ground | null {
  const i = tx + ty * level.width;
  if (!level.caveFloor.has(i)) return null;
  const n = noise(tx, ty, CAVE_NOISE_SCALE);
  const zone = level.caveZone.has(i);
  if (n < CAVE_LEVEL && !zone) return null;
  const v = hash(tx, ty);
  const pick = (from: ReadonlyArray<Src>): Ground => ({ kind: 'cave', sx: from[v % from.length][0], sy: from[v % from.length][1], sheet: CAVE_GROUND });
  if (zone && noise(tx + HEATH_SHIFT, ty + HEATH_SHIFT, HEATH_SCALE) > HEATH_LEVEL) return { ...pick(CAVE_HEATH), kind: 'heath' };
  if (n > CAVE_GRASS_LEVEL) return pick(CAVE_GRASS);
  if (v % CAVE_PEBBLE_EVERY === 0) return pick(CAVE_PEBBLES);
  return pick(CAVE_PLAIN);
}

/** Catacomb floor: the safe room's slabs, an odd drain grate, patches of moss and rough earth in the cobbles. */
function stoneGround(level: Level, t: TileData, tx: number, ty: number): Ground {
  const v = hash(tx, ty);
  const at = (kind: GroundKind, from: ReadonlyArray<Src>): Ground => ({ kind, sx: from[v % from.length][0], sy: from[v % from.length][1] });
  if (level.isSafeZone(tx, ty)) return at('safe', FLOOR_SAFE);
  const n = noise(tx, ty, FLOOR_NOISE_SCALE);
  if (v % GRATE_EVERY === 0 && t.type === TileType.Floor) return at('stone', FLOOR_GRATES);
  if (n > FLOOR_ROUGH_LEVEL) return at('rough', FLOOR_ROUGH);
  if (n > FLOOR_PATCH_LEVEL) return at('patch', FLOOR_PATCH);
  return at('stone', FLOOR_MAIN);
}

/** The ground a tile is floored with, or null when it isn't floor (walls, holes, off the map). */
export function groundAt(level: Level, tx: number, ty: number): Ground | null {
  const t = level.getTile(tx, ty);
  // A pit's own tiles are floored too: a quatrefoil leaves their corners open ground, and the pit art covers the rest.
  const pitFloor = t?.type === TileType.Hole && level.hasPit(tx, ty);
  // A slanted wall's tiles are floored too: its art covers the wall's side of the slant.
  const sloped = level.slopes.has(tx + ty * level.width);
  if (!t || (t.type !== TileType.Floor && t.type !== TileType.Obstacle && !pitFloor && !sloped)) return null;
  // A bridge's planks lie over the dark of the chasm (CaveTerrain.ts), not over ground.
  if (level.bridges.has(tx + ty * level.width)) return null;
  if (level.theme === 'castle') {
    const floor = castleFloor(level, tx, ty, noise(tx, ty, FLOOR_NOISE_SCALE));
    return { ...floor, sheet: CASTLE_TILESET };
  }
  // The isometric castle's tones meet at hard edges: all of it is one kind of ground, so nothing blends.
  if (level.theme === 'castle2') return { kind: 'stone', ...isoFloorSource(level, tx, ty), sheet: ISO_FLOORS };
  // The mines' tones of earth meet along ragged edges of their own (MineGround.ts): all of it is one kind here, so nothing spills.
  if (level.theme === 'mines') return { kind: 'rough', ...mineFloorSource(level, tx, ty), sheet: MINE_GROUND };
  return caveGround(level, tx, ty) ?? stoneGround(level, t, tx, ty);
}

export function buildTerrainPieces(level: Level): TerrainPiece[] {
  if (level.theme === 'castle2') return buildIsoTerrain(level);
  if (level.theme === 'mines') return buildMineTerrain(level);
  return new TerrainBuilder(level).build();
}

/** World-space tile columns where a full-height face shows a pillar (no torch there). */
export function isPillarColumn(tx: number): boolean {
  return tx % PILLAR_EVERY === PILLAR_PHASE;
}
