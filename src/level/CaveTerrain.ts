import type { Level } from './Level';
import { TileType, TILE_HEIGHT, TILE_WIDTH } from './TileType';
import type { TerrainPiece } from './TerrainAutotile';
import { slantFootY } from './IsoTerrain';
import { caveBulge } from './CaveShape';

/**
 * The caverns of a catacomb level (level.caveZone, generators/CaveZone.ts), drawn from the cave set
 * (public/caves/MainLev2.0.png) instead of the catacombs' bricks: rock walls of heaped stones, their tops dark, a cliff of
 * rocks where they face south; the chasm down through the caverns, its brinks ragged, a cliff falling into the dark
 * under its north brink; and wooden bridges over it. The set's blocks are templates six tiles across, read quarter by
 * quarter (16 px) by what lies round each tile, as tilesets of its kind are laid. A corridor down the slant is drawn
 * stepped, its slanted walls as rock like any other.
 */

/** The cave set's texture key (the cave ground's too). */
export const CAVE_SHEET = 'cave_ground';
/**
 * The chasm block's ring with its ground cleared, only its dark ragged brinks left (built at load, assets/AssetLoader.ts
 * `buildCaveBrinks`), laid over whatever ground runs up to the chasm. Its pixels are the block's, from its top left.
 */
export const CAVE_BRINKS = 'cave_brinks';
/** The block the brinks are cut from, and how bright a pixel of it may be and still be brink (not ground). */
export const BRINK_BLOCK = { x: 1440, y: 256, w: 192, h: 192 };
export const BRINK_DARKEST_GROUND = 26;

const T = TILE_WIDTH;
const Q = T / 2;
/**
 * The dark rock block (cols 2–7, rows 13–21): its top row the rim of stones along a wall's north edge, its outer columns
 * the rims down its sides, black inside, and under it (from FACE_Y) the cliff of stones a wall shows to the south, the
 * floor's line FACE_FLOOR down it (the rest spills over the floor at its foot).
 */
const ROCK = { x: 64, y: 416 };
const FACE_Y = 608;
const FACE_H = 80;
const FACE_FLOOR = 64;
/** A face over a wall only one tile deep shows only this much of the cliff (its foot). */
const FACE_THIN = 48;
const EDGE_COL = 5;
const MID_TILES = 4;
/**
 * The chasm block (cols 45–50, rows 8–13): a hole ringed by ground, the ring's ragged brinks on the ground's side, the
 * hole's top row the cliff under its north brink, black below.
 */
const HOLE = { x: BRINK_BLOCK.x, y: BRINK_BLOCK.y };
const HOLE_MID = 2;
/** The bridge (cols 45–49, rows 32–37): its deck of planks, and a leg under it. */
const DECK = { x: 1442, y: 1024, w: 156, h: 38 };
const DECK_RISE = 3;
/** The deck's ends rest this far over the ground beyond each brink. */
const DECK_REST = 16;
const LEG = { x: 1482, y: 1062, w: 10, h: 56 };
const LEG_INSET = 11;
const LEG_EVERY = 2;
/** One wall tile in this many spills its north rim's stones over the ground north of it (its sides all do, CaveShape.ts). */
const BULGE_EVERY = 2;
/** Along a south slant the rim's stones sit this far over the slant's line, and hide whoever stands this far below it. */
const SLANT_RIM_RISE = 12;
const SLANT_RIM_SINK = 8;

function hash(x: number, y: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

type Quarter = 0 | 1;
const QUARTERS: ReadonlyArray<readonly [Quarter, Quarter]> = [[0, 0], [1, 0], [0, 1], [1, 1]];

function piece(dx: number, dy: number, sx: number, sy: number, w: number, h: number, z?: number): TerrainPiece {
  const out: TerrainPiece = { dx, dy, sx, sy, w, h, sheet: CAVE_SHEET };
  if (z !== undefined) out.z = z;
  return out;
}

/** Lays the caverns' pieces: ground brinks go with the floors, the rest with the walls (rock, chasm, faces, bridges). */
export function addCavePieces(level: Level, floors: TerrainPiece[], walls: TerrainPiece[]): void {
  const cave = new CaveLayer(level, floors, walls);
  cave.lay();
}

class CaveLayer {
  constructor(private readonly level: Level, private readonly floors: TerrainPiece[], private readonly walls: TerrainPiece[]) {}

  private type(tx: number, ty: number): TileType {
    return this.level.getTile(tx, ty)?.type ?? TileType.Wall;
  }

  private wall(tx: number, ty: number): boolean {
    const t = this.type(tx, ty);
    return t === TileType.Wall || t === TileType.BreakableWall;
  }

  /** The chasm (a Hole of no pit) or a bridge over it: the dark goes on under the planks. */
  private chasm(tx: number, ty: number): boolean {
    if (this.level.bridges.has(tx + ty * this.level.width)) return true;
    return this.type(tx, ty) === TileType.Hole && !this.level.hasPit(tx, ty);
  }

  lay(): void {
    const W = this.level.width;
    const zone = [...this.level.caveZone];
    const at = (i: number): [number, number] => [i % W, Math.floor(i / W)];
    for (const i of zone) this.ground(...at(i));
    // The bridges lie over the chasm but under the rock: where a deck runs into a wall, the wall's stones are in front.
    for (const i of zone) this.deck(...at(i));
    for (const i of zone) this.top(...at(i));
    for (const i of zone) this.face(...at(i));
    for (const i of zone) this.slant(...at(i));
  }

  /** What lies on a tile: a wall's top, the chasm, or the ragged brinks over ground beside the chasm. */
  private ground(tx: number, ty: number): void {
    if (this.wall(tx, ty)) return;
    if (this.chasm(tx, ty)) this.hole(tx, ty);
    else this.brinks(tx, ty);
  }

  /**
   * A chasm tile: the even dark of the hole's middle (its edges are the brinks laid over the ground round it; the block's
   * own edge tiles, a shade lighter, would show the tiles as squares).
   */
  private hole(tx: number, ty: number): void {
    this.walls.push(piece(tx * T, ty * T, HOLE.x + HOLE_MID * T, HOLE.y + HOLE_MID * T, T, T));
  }

  /** Ground beside the chasm: the ring's ragged brink over each quarter that faces it (along a side, or round a corner). */
  private brinks(tx: number, ty: number): void {
    for (const [cx, cy] of QUARTERS) {
      const sx = cx === 0 ? -1 : 1;
      const sy = cy === 0 ? -1 : 1;
      const h = this.chasm(tx + sx, ty);
      const v = this.chasm(tx, ty + sy);
      // Touching the chasm only at a corner, the ground keeps its own edge: the block's corner piece is mostly dark there
      // and would show as a square.
      if (!h && !v) continue;
      const col = h || !v ? (cx === 0 ? EDGE_COL : 0) : HOLE_MID + (tx % 2);
      const row = v || !h ? (cy === 0 ? EDGE_COL : 0) : HOLE_MID + (ty % 2);
      const quarter = piece(tx * T + cx * Q, ty * T + cy * Q, col * T + cx * Q, row * T + cy * Q, Q, Q);
      quarter.sheet = CAVE_BRINKS;
      quarter.floor = true;
      this.floors.push(quarter);
    }
  }

  /**
   * A wall's top, quarter by quarter: the rim of stones along a north edge with open ground beyond it and down its sides,
   * black inside. The quarters a face covers (open ground south) are left to it. Over the floor north of it (someone may
   * stand behind it) it is drawn over them.
   */
  private sloped(tx: number, ty: number): boolean {
    return this.level.slopes.has(tx + ty * this.level.width);
  }

  /** Open ground beside a wall (its rim shows): not wall, and not a slanted wall's tile (which draws its own). */
  private open(tx: number, ty: number): boolean {
    return !this.wall(tx, ty) && !this.sloped(tx, ty);
  }

  private top(tx: number, ty: number): void {
    if (!this.wall(tx, ty) || this.sloped(tx, ty)) return;
    const open = (x: number, y: number) => this.open(x, y);
    const w = open(tx - 1, ty);
    const e = open(tx + 1, ty);
    const n = open(tx, ty - 1);
    const s = open(tx, ty + 1);
    const north = this.level.getTile(tx, ty - 1);
    const behind = !!north && (north.passable || north.type === TileType.Obstacle) && north.type !== TileType.Hole;
    const z = behind ? (ty + 1) * TILE_HEIGHT : undefined;
    for (const [cx, cy] of QUARTERS) {
      if (cy === 1 && s) continue;
      const side = cx === 0 ? -1 : 1;
      // Ground touching only at a corner: the rim's stones round it (a nub of the top rim above, of the side rim below).
      const corner = !open(tx + side, ty) && open(tx + side, ty + (cy === 0 ? -1 : 1)) && (cy === 0 ? !n : !s);
      const col = corner && cy === 1 ? (cx === 0 ? 0 : EDGE_COL) : edgeOr(cx === 0 ? w : e, cx === 0 ? e : w, cx, 0, EDGE_COL, 1 + (tx % MID_TILES));
      const row = n || (corner && cy === 0) ? 0 : 1 + (ty % MID_TILES);
      this.walls.push(piece(tx * T + cx * Q, ty * T + cy * Q, ROCK.x + col * T + cx * Q, ROCK.y + row * T + cy * Q, Q, Q, z));
    }
    this.bulge(tx, ty, { w, e, n, s }, z);
  }

  /**
   * The rim's stones spill a few pixels past the wall's edge over the ground beside it, more in some places than others,
   * so its edges wander as rock does instead of running ruler-straight.
   */
  private bulge(tx: number, ty: number, open: { w: boolean; e: boolean; n: boolean; s: boolean }, z: number | undefined): void {
    const rows: Quarter[] = open.s ? [0] : [0, 1];
    const rimRow = (open.n ? 0 : 1 + (ty % MID_TILES)) * T;
    for (const cy of rows) {
      if (open.w) this.walls.push(piece(tx * T - caveBulge(tx, ty, -1, cy), ty * T + cy * Q, ROCK.x, ROCK.y + rimRow + cy * Q, Q, Q, z));
      if (open.e) this.walls.push(piece(tx * T + Q + caveBulge(tx, ty, 1, cy), ty * T + cy * Q, ROCK.x + EDGE_COL * T + Q, ROCK.y + rimRow + cy * Q, Q, Q, z));
    }
    const v = hash(tx, ty);
    if (!open.n || v % BULGE_EVERY !== 0) return;
    const cx: Quarter = (v >>> 8) & 1 ? 1 : 0;
    this.walls.push(piece(tx * T + cx * Q, ty * T - caveBulge(tx, ty, 1, 0), ROCK.x + (1 + (tx % MID_TILES)) * T + cx * Q, ROCK.y, Q, Q, z));
  }

  /**
   * A slanted wall's tile (a corridor down the slant, a cut corner): its rock follows the slant 16 px at a time, as the
   * slant pushes bodies back, rather than stepping a whole tile: a cliff of stones along a north slant's foot, the rim of
   * stones along a south one with the dark below it.
   */
  private slant(tx: number, ty: number): void {
    const slope = this.level.slopes.get(tx + ty * this.level.width);
    if (!slope) return;
    const left = slantFootY(slope, tx, ty, false);
    const right = slantFootY(slope, tx, ty, true);
    const north = slope.corner === 'nw' || slope.corner === 'ne';
    for (const cx of [0, 1] as const) {
      const foot = Math.round(left + ((right - left) * (cx * Q + Q / 2)) / T);
      // Where the slant ends beside open ground, its column on that side is the rim's (or the cliff's) end.
      const col = this.slantColumn(tx, ty, cx);
      if (north) this.walls.push(piece(tx * T + cx * Q, foot + (FACE_H - FACE_FLOOR) - FACE_H, ROCK.x + col * T + cx * Q, FACE_Y, Q, FACE_H));
      else this.southSlantColumn(tx, ty, cx, col, foot, Math.max(left, right) + SLANT_RIM_SINK);
    }
  }

  /** The template column a slant tile's half draws from: a side rim's where open ground lies beside it, else the middle. */
  private slantColumn(tx: number, ty: number, cx: Quarter): number {
    if (cx === 0 && this.open(tx - 1, ty)) return 0;
    if (cx === 1 && this.open(tx + 1, ty)) return EDGE_COL;
    return 1 + (tx % MID_TILES);
  }

  /**
   * One half of a south slant's tile: the rim of stones along the slant, the wall's dark below it (its side rim where open
   * ground lies beside), and its cliff at the tile's foot where open ground lies below it.
   */
  private southSlantColumn(tx: number, ty: number, cx: Quarter, col: number, foot: number, z: number): void {
    const x = tx * T + cx * Q;
    const rimTop = foot - SLANT_RIM_RISE;
    const bottom = (ty + 1) * T;
    this.walls.push(piece(x, rimTop, ROCK.x + col * T + cx * Q, ROCK.y, Q, T, z));
    const side = col === 0 || col === EDGE_COL;
    for (let y = rimTop + T; y < bottom; y += Q) {
      const sy = side ? ROCK.y + (1 + (ty % MID_TILES)) * T + ((y - rimTop) % T) : ROCK.y + 2 * T;
      this.walls.push(piece(x, y, ROCK.x + col * T + (side ? cx * Q : 2 * T - col * T), sy, Q, Math.min(Q, bottom - y), z));
    }
    if (!this.open(tx, ty + 1)) return;
    const shown = Math.min(FACE_H, bottom + (FACE_H - FACE_FLOOR) - rimTop - Q);
    this.walls.push(piece(x, bottom + (FACE_H - FACE_FLOOR) - shown, ROCK.x + col * T + cx * Q, FACE_Y + FACE_H - shown, Q, shown));
  }

  /** A wall with open ground south shows its cliff of stones, ending at its sides where the face does not run on. */
  private face(tx: number, ty: number): void {
    if (!this.wall(tx, ty) || this.sloped(tx, ty) || !this.open(tx, ty + 1)) return;
    const runsOn = (x: number) => this.wall(x, ty) && this.open(x, ty + 1);
    const col = !runsOn(tx - 1) ? 0 : !runsOn(tx + 1) ? EDGE_COL : 1 + (tx % MID_TILES);
    const shown = this.wall(tx, ty - 1) ? FACE_H : FACE_THIN;
    const foot = (ty + 1) * T + (FACE_H - FACE_FLOOR);
    this.walls.push(piece(tx * T, foot - shown, ROCK.x + col * T, FACE_Y + FACE_H - shown, T, shown));
  }

  /** A bridge tile: a stretch of the deck (its ends at the bridge's ends), and now and then a leg under its south row. */
  private deck(tx: number, ty: number): void {
    const W = this.level.width;
    if (!this.level.bridges.has(tx + ty * W)) return;
    const bridge = (x: number, y: number) => this.level.bridges.has(x + y * W);
    const dy = ty * T - DECK_RISE;
    const plank = (dx: number, sx: number, w: number) => this.walls.push(piece(dx, dy, sx, DECK.y, w, DECK.h));
    // Its ends run on half a tile over the ground beyond the brink, so the planks rest on it.
    if (!bridge(tx - 1, ty)) {
      plank(tx * T - DECK_REST, DECK.x, DECK_REST);
      plank(tx * T, DECK.x + DECK_REST, T);
    } else if (!bridge(tx + 1, ty)) {
      plank(tx * T, DECK.x + DECK.w - DECK_REST - T, T);
      plank((tx + 1) * T, DECK.x + DECK.w - DECK_REST, DECK_REST);
    } else {
      plank(tx * T, DECK.x + DECK_REST + (tx % MID_TILES) * T, T);
    }
    // Legs go down only into the dark: under the bridge's south row, where all they reach is chasm.
    const dark = (y: number) => this.type(tx, y) === TileType.Hole && !bridge(tx, y);
    if (bridge(tx, ty + 1) || tx % LEG_EVERY !== 0 || !dark(ty + 1) || !dark(ty + 2)) return;
    this.walls.push(piece(tx * T + LEG_INSET, ty * T + DECK.h - DECK_RISE, LEG.x, LEG.y, LEG.w, LEG.h));
  }
}

/**
 * The template column (or row) a quarter takes: the edge on its own side if open there, else the edge on the other
 * side if that is open (the rest of that side's rim), else the middle one given.
 */
function edgeOr(ownOpen: boolean, otherOpen: boolean, half: Quarter, low: number, high: number, mid: number): number {
  const own = half === 0 ? low : high;
  const other = half === 0 ? high : low;
  if (ownOpen) return own;
  return otherOpen ? other : mid;
}
