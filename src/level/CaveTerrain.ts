import type { Level } from './Level';
import { TileType, TILE_HEIGHT, TILE_WIDTH } from './TileType';
import type { TerrainPiece } from './TerrainAutotile';

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
export const BRINK_DARKEST_GROUND = 35;

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
const HOLE_EDGE = 4;
const HOLE_MID = 2;
/** The bridge (cols 45–49, rows 32–37): its deck of planks, and a leg under it. */
const DECK = { x: 1442, y: 1024, w: 156, h: 38 };
const DECK_RISE = 3;
const LEG = { x: 1482, y: 1062, w: 10, h: 56 };
const LEG_INSET = 11;
const LEG_EVERY = 2;

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
    for (const i of zone) this.top(...at(i));
    for (const i of zone) this.face(...at(i));
    for (const i of zone) this.deck(...at(i));
  }

  /** What lies on a tile: a wall's top, the chasm, or the ragged brinks over ground beside the chasm. */
  private ground(tx: number, ty: number): void {
    if (this.wall(tx, ty)) return;
    if (this.chasm(tx, ty)) this.hole(tx, ty);
    else this.brinks(tx, ty);
  }

  /** A chasm tile, quarter by quarter: the cliff under a north brink, the dark below, the hole's edges at its sides. */
  private hole(tx: number, ty: number): void {
    const open = (x: number, y: number) => !this.chasm(x, y);
    const w = open(tx - 1, ty);
    const e = open(tx + 1, ty);
    const n = open(tx, ty - 1);
    const s = open(tx, ty + 1);
    for (const [cx, cy] of QUARTERS) {
      const col = edgeOr(cx === 0 ? w : e, cx === 0 ? e : w, cx, 1, HOLE_EDGE, HOLE_MID + (tx % 2));
      const row = edgeOr(cy === 0 ? n : s, cy === 0 ? s : n, cy, 1, HOLE_EDGE, HOLE_MID + (ty % 2));
      this.walls.push(piece(tx * T + cx * Q, ty * T + cy * Q, HOLE.x + col * T + cx * Q, HOLE.y + row * T + cy * Q, Q, Q));
    }
  }

  /** Ground beside the chasm: the ring's ragged brink over each quarter that faces it (side, end or corner). */
  private brinks(tx: number, ty: number): void {
    for (const [cx, cy] of QUARTERS) {
      const sx = cx === 0 ? -1 : 1;
      const sy = cy === 0 ? -1 : 1;
      const h = this.chasm(tx + sx, ty);
      const v = this.chasm(tx, ty + sy);
      const d = this.chasm(tx + sx, ty + sy);
      if (!h && !v && !d) continue;
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
  private top(tx: number, ty: number): void {
    if (!this.wall(tx, ty)) return;
    const open = (x: number, y: number) => !this.wall(x, y);
    const w = open(tx - 1, ty);
    const e = open(tx + 1, ty);
    const n = open(tx, ty - 1);
    const s = open(tx, ty + 1);
    const north = this.level.getTile(tx, ty - 1);
    const behind = !!north && (north.passable || north.type === TileType.Obstacle) && north.type !== TileType.Hole;
    const z = behind ? (ty + 1) * TILE_HEIGHT : undefined;
    for (const [cx, cy] of QUARTERS) {
      if (cy === 1 && s) continue;
      const col = edgeOr(cx === 0 ? w : e, cx === 0 ? e : w, cx, 0, EDGE_COL, 1 + (tx % MID_TILES));
      const nub = cy === 0 && !n && open(tx + (cx === 0 ? -1 : 1), ty - 1);
      const row = n || nub ? 0 : 1 + (ty % MID_TILES);
      this.walls.push(piece(tx * T + cx * Q, ty * T + cy * Q, ROCK.x + col * T + cx * Q, ROCK.y + row * T + cy * Q, Q, Q, z));
    }
  }

  /** A wall with open ground south shows its cliff of stones, ending at its sides where the face does not run on. */
  private face(tx: number, ty: number): void {
    if (!this.wall(tx, ty) || this.wall(tx, ty + 1)) return;
    const runsOn = (x: number) => this.wall(x, ty) && !this.wall(x, ty + 1);
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
    const stretch = DECK.x + Q / 2 + (tx % MID_TILES) * T;
    const sx = !bridge(tx - 1, ty) ? DECK.x : !bridge(tx + 1, ty) ? DECK.x + DECK.w - T : stretch;
    this.walls.push(piece(tx * T, ty * T - DECK_RISE, sx, DECK.y, T, DECK.h));
    if (bridge(tx, ty + 1) || tx % LEG_EVERY !== 0) return;
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
