import type { FloorZone, Level } from './Level';
import type { TerrainPiece } from './TerrainAutotile';
import { TileType, TILE_HEIGHT, TILE_WIDTH, UNDER_WALL_INSET } from './TileType';
import { forEachTile, tileHash } from './Grid';
import {
  FACE_FOOT, FACE_H, MINE_CHASM_E, MINE_CHASM_LIP_S, MINE_CHASM_N, MINE_CHASM_W, MINE_FACE_END_LEFT, MINE_FACE_END_RIGHT,
  MINE_FACES, MINE_GROUND, MINE_GROUND_BLOCKS, MINE_RIM_E, MINE_RIM_N, MINE_RIM_NE, MINE_RIM_NW, MINE_RIM_SLANT, MINE_RIM_W,
  MINE_SLANT_FACES, MINE_SUNKEN_POSTS, MINE_VOID, MINE_DECOR, holeArtOffset,
} from './MineTiles';
import { mineHole } from './PitShapes';
import type { Pit } from './PitShapes';
import type { IsoRect, SlantStrip } from './IsoTiles';
import type { Slope } from './Slopes';
import { isSouthSlope } from './Slopes';
import { faceDepth, slantFootY, slantRimDepth, voidColumn } from './IsoTerrain';
import { SOUTH_WALL_RAISE } from './Theme';

/**
 * Autotiles the forgotten mines (Theme 'mines') on its 32 px tiles, from the art mapped in MineTiles.ts, as the
 * isometric castle is (IsoTerrain.ts), but with the caves' own rock:
 * - floor: its tone's earth, with patches of other earth lying on it in ragged ellipses (a FloorZone with `patch`),
 *   their edges spilling softly over the earth round them (GroundBlend.ts);
 * - a wall with floor below it is the foot of a tall rock face (its stone four tiles high under the black rock top),
 *   cut short where the rock behind it is thinner (a corridor or room close behind), its rim drawn over the cut;
 * - a wall cutting a north corner off on the slant shows the face on the slant, a south one the rim along it;
 * - every other wall is black, scalloped where floor touches it; a chasm's north edge drops away as a dark cliff into
 *   the black, old pit props rising out of it now and then;
 * - a hole in the floor (a pit of shape 'hole') is its art from the set's decorations, centred on its tiles.
 * Faces stand behind whoever is in front of them; the rims along a room's south side and a chasm's north edge are
 * drawn over the feet of whoever steps up to them, as in the other themes.
 */

/** Ground under foot, a wall (or off the map), a chasm, or a slanted wall's tile. */
type Cell = 'ground' | 'wall' | 'chasm' | 'slope';

/** A face reaches over its foot row and this many rows above it, when the rock is that deep. */
const FACE_ROWS = 5;
/** A face cut short starts this far below the top of its highest wall row: under the rim drawn there over the cut. */
const CUT_UNDER_RIM = 16;
/** A chasm's cliff falls over at most this many of its rows. */
const CLIFF_ROWS = MINE_CHASM_N[0].h / TILE_HEIGHT;
/** One chasm rim tile in this many (by hash), where the rim runs on both sides, has a pit prop rising under it. */
const POST_EVERY = 4;
/** The dark under it must run this many tiles deep; the post's top is this far below the rim's top. */
const POST_DEPTH = 3;
const POST_TOP = 6;
/** A post stands up to this far either way off its tile's middle (by hash). */
const POST_JITTER = 6;
/**
 * A patch of earth fills an ellipse in its zone, its rim eaten away by up to this share of the radius (by hash) so no
 * two patches have the same outline.
 */
const PATCH_RAGGED = 0.45;

function piece(r: IsoRect, dx: number, dy: number, h = r.h, z?: number, sy = r.y): TerrainPiece {
  return z === undefined ? { dx, dy, sx: r.x, sy, w: r.w, h } : { dx, dy, sx: r.x, sy, w: r.w, h, z };
}

/**
 * The tone (MINE_GROUND_BLOCKS index) a tile's ground is laid in: the last patch whose ragged ellipse holds it, else the
 * last whole zone holding it.
 */
export function mineFloorTone(level: Level, tx: number, ty: number): number {
  return minePatchAt(level, tx, ty)?.tone ?? mineBaseTone(level, tx, ty);
}

/** The tone of the last whole zone (not a patch) holding a tile. */
function mineBaseTone(level: Level, tx: number, ty: number): number {
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

class MineTerrainBuilder {
  private readonly floors: TerrainPiece[] = [];
  private readonly walls: TerrainPiece[] = [];
  private readonly over: TerrainPiece[] = [];
  /** Rims drawn over the cut top of a face (after it, at its depth). */
  private readonly overFaces: TerrainPiece[] = [];
  private readonly raise: number;

  constructor(private readonly level: Level) {
    this.raise = SOUTH_WALL_RAISE[level.theme];
  }

  build(): TerrainPiece[] {
    const { level } = this;
    forEachTile(0, 0, level.width - 1, level.height - 1, this.addTile);
    for (const pit of level.pits) this.addHole(pit);
    return [...this.floors, ...this.walls, ...this.over, ...this.overFaces];
  }

  /** A hole in the floor: its art centred on its tiles, over the ground they are floored with. */
  private addHole(pit: Pit): void {
    const hole = mineHole(pit);
    if (!hole) return;
    const at = holeArtOffset(hole);
    const { art } = hole;
    this.walls.push({ dx: pit.x * TILE_WIDTH + at.x, dy: pit.y * TILE_HEIGHT + at.y, sx: art.x, sy: art.y, w: art.w, h: art.h, sheet: MINE_DECOR });
  }

  // ── What a tile is ───────────────────────────────────────────────────────────

  private cell(tx: number, ty: number): Cell {
    const tile = this.level.getTile(tx, ty);
    if (!tile) return 'wall';
    if (this.level.slopes.has(tx + ty * this.level.width)) return 'slope';
    if (tile.type === TileType.Wall || tile.type === TileType.BreakableWall) return 'wall';
    return this.level.isChasm(tx, ty) ? 'chasm' : 'ground';
  }

  private ground(tx: number, ty: number): boolean {
    return this.cell(tx, ty) === 'ground';
  }

  /** The bottom row of a face: a wall with ground right below it. */
  private faceFoot(tx: number, ty: number): boolean {
    return this.cell(tx, ty) === 'wall' && this.ground(tx, ty + 1);
  }

  private northSlope(tx: number, ty: number): boolean {
    const slope = this.level.slopes.get(tx + ty * this.level.width);
    return !!slope && !isSouthSlope(slope);
  }

  /** The depth of the face (straight or slanted) drawn over a wall tile from below, or -1 if none reaches it. */
  private faceBelow(tx: number, ty: number): number {
    for (let k = 1; k < FACE_ROWS; k++) {
      if (this.northSlope(tx, ty + k)) return faceDepth(ty + k);
      if (this.cell(tx, ty + k) !== 'wall') return -1;
      if (this.faceFoot(tx, ty + k)) return faceDepth(ty + k);
    }
    return -1;
  }

  /** How many rows of rock stand from row ty upward (ty itself counted when `self`), up to FACE_ROWS. */
  private rockAbove(tx: number, ty: number, self: boolean): number {
    let rows = self ? 1 : 0;
    while (rows < FACE_ROWS && this.cell(tx, ty - rows - (self ? 0 : 1)) === 'wall') rows++;
    return rows;
  }

  // ── Per tile ─────────────────────────────────────────────────────────────────

  private readonly addTile = (tx: number, ty: number): void => {
    const cell = this.cell(tx, ty);
    if (cell === 'ground' || cell === 'slope') this.addFloor(tx, ty);
    else if (cell === 'wall') this.addFloorUnderWall(tx, ty);
    if (cell === 'slope') this.addSlant(tx, ty);
    else if (cell === 'chasm') this.addChasm(tx, ty);
    else if (cell === 'wall') this.addWall(tx, ty);
  };

  private addWall(tx: number, ty: number): void {
    if (this.faceFoot(tx, ty)) this.addFace(tx, ty);
    const covered = this.faceFoot(tx, ty) ? faceDepth(ty) : this.faceBelow(tx, ty);
    if (covered < 0) {
      this.addWallTop(tx, ty);
      return;
    }
    // The top of a face cut short: the rim of the rock behind it drawn over the cut.
    if (this.ground(tx, ty - 1)) this.overFaces.push(piece(MINE_RIM_N[tx % MINE_RIM_N.length], tx * TILE_WIDTH, ty * TILE_HEIGHT - this.raise, MINE_RIM_N[0].h, covered));
  }

  private addFloor(tx: number, ty: number): void {
    const { sx, sy } = mineFloorSource(this.level, tx, ty);
    this.floors.push({ dx: tx * TILE_WIDTH, dy: ty * TILE_HEIGHT, sx, sy, w: TILE_WIDTH, h: TILE_HEIGHT, sheet: MINE_GROUND, floor: true });
  }

  /** The earth of the room north of a south wall, run on under it: what shows where the wall clears over someone. */
  private addFloorUnderWall(tx: number, ty: number): void {
    const slope = this.level.slopes.get(tx + (ty - 1) * this.level.width);
    const southSlant = !!slope && isSouthSlope(slope);
    if (!southSlant && !this.ground(tx, ty - 1)) return;
    const reach = slope && southSlant ? Math.min(TILE_HEIGHT, slantRimDepth(slope, tx, ty - 1) - ty * TILE_HEIGHT) : TILE_HEIGHT;
    const h = reach - UNDER_WALL_INSET;
    if (h <= 0) return;
    const { sx, sy } = mineFloorSource(this.level, tx, ty, mineBaseTone(this.level, tx, ty - 1));
    this.floors.push({ dx: tx * TILE_WIDTH, dy: ty * TILE_HEIGHT, sx, sy, w: TILE_WIDTH, h, sheet: MINE_GROUND, floor: true });
  }

  /**
   * A face from its foot tile up, as tall as the rock behind it allows (cut under the rim of whatever lies behind), its
   * rock outline down whichever end it ends at. Drawn among the entities, in front of whoever stands behind it.
   */
  private addFace(tx: number, ty: number): void {
    const dx = tx * TILE_WIDTH;
    const z = faceDepth(ty);
    const art = MINE_FACES[tx % MINE_FACES.length];
    const rows = this.rockAbove(tx, ty, true);
    const { dy, h, sy } = this.cut((ty + 1) * TILE_HEIGHT - FACE_FOOT, FACE_H, art.y, ty - rows + 1, rows);
    this.over.push(piece(art, dx, dy, h, z, sy));
    if (!this.faceFoot(tx - 1, ty)) this.addFaceEnd(MINE_FACE_END_LEFT, dx - MINE_FACE_END_LEFT.w, ty, rows, z);
    if (!this.faceFoot(tx + 1, ty)) this.addFaceEnd(MINE_FACE_END_RIGHT, dx + TILE_WIDTH, ty, rows, z);
  }

  private addFaceEnd(art: IsoRect, dx: number, ty: number, rows: number, z: number): void {
    const { dy, h, sy } = this.cut((ty + 1) * TILE_HEIGHT - FACE_FOOT, FACE_H, art.y, ty - rows + 1, rows);
    this.over.push(piece(art, dx, dy, h, z, sy));
  }

  /**
   * A piece standing at `dy` (h tall, cut from sheet row `sy`), cut down to start under the rim of the rock's highest row
   * `topRow` when the rock is not FACE_ROWS deep.
   */
  private cut(dy: number, h: number, sy: number, topRow: number, rows: number): { dy: number; h: number; sy: number } {
    if (rows >= FACE_ROWS) return { dy, h, sy };
    const top = topRow * TILE_HEIGHT + CUT_UNDER_RIM;
    if (dy >= top) return { dy, h, sy };
    return { dy: top, h: h - (top - dy), sy: sy + (top - dy) };
  }

  /**
   * A wall top: black, with the scalloped rim on each side floor touches and where two rims meet. One with floor north
   * of it is a room's south edge: drawn over whoever steps up to it, raised a little over the floor (SOUTH_WALL_RAISE).
   */
  private addWallTop(tx: number, ty: number): void {
    const dx = tx * TILE_WIDTH;
    const dy = ty * TILE_HEIGHT;
    const north = this.ground(tx, ty - 1);
    const z = north ? (ty + 1) * TILE_HEIGHT : undefined;
    const lift = north ? this.raise : 0;
    const top = dy - lift;
    const west = this.ground(tx - 1, ty);
    const east = this.ground(tx + 1, ty);
    const out = z === undefined ? this.walls : this.over;
    const westH = MINE_RIM_W.h + lift - (this.raisedSlantBelow(tx - 1, ty) ? this.raise : 0);
    const eastH = MINE_RIM_E.h + lift - (this.raisedSlantBelow(tx + 1, ty) ? this.raise : 0);
    if (north) out.push(piece(MINE_RIM_N[tx % MINE_RIM_N.length], dx, top, MINE_RIM_N[0].h, z));
    if (lift > 0) out.push(piece(MINE_VOID, dx, dy + TILE_HEIGHT - lift, lift, z));
    if (west) out.push(piece(MINE_RIM_W, dx, top, westH, z));
    if (east) out.push(piece(MINE_RIM_E, dx + TILE_WIDTH - MINE_RIM_E.w, top, eastH, z));
    if (north && west) this.over.push(piece(MINE_RIM_NW, dx, top, MINE_RIM_NW.h, z));
    if (north && east) this.over.push(piece(MINE_RIM_NE, dx + TILE_WIDTH - MINE_RIM_NE.w, top, MINE_RIM_NE.h, z));
  }

  /** Whether the tile under (tx, ty) lies on a south slant, whose rim is drawn raised. */
  private raisedSlantBelow(tx: number, ty: number): boolean {
    const slope = this.level.slopes.get(tx + (ty + 1) * this.level.width);
    return this.raise > 0 && !!slope && isSouthSlope(slope);
  }

  /**
   * A chasm tile: where floor lies north, its lip and the dark cliff falling away under it (as deep as the chasm runs),
   * drawn over the feet of whoever stands at its edge; rims at its sides, the floor's lip where floor lies south.
   */
  private addChasm(tx: number, ty: number): void {
    const dx = tx * TILE_WIDTH;
    const dy = ty * TILE_HEIGHT;
    const north = this.ground(tx, ty - 1);
    const z = north ? (ty + 1) * TILE_HEIGHT : undefined;
    const sides = north ? this.over : this.walls;
    if (north) {
      const rows = this.chasmBelow(tx, ty, CLIFF_ROWS);
      this.over.push(piece(MINE_CHASM_N[tx % MINE_CHASM_N.length], dx, dy, rows * TILE_HEIGHT, z));
      this.addPost(tx, ty, z);
    }
    if (this.ground(tx, ty + 1)) {
      const lip = MINE_CHASM_LIP_S[tx % MINE_CHASM_LIP_S.length];
      this.walls.push(piece(lip, dx, dy + TILE_HEIGHT - lip.h));
    }
    if (this.ground(tx - 1, ty)) sides.push(piece(MINE_CHASM_W, dx, dy, MINE_CHASM_W.h, z));
    if (this.ground(tx + 1, ty)) sides.push(piece(MINE_CHASM_E, dx + TILE_WIDTH - MINE_CHASM_E.w, dy, MINE_CHASM_E.h, z));
  }

  /** How many chasm rows run down from (tx, ty), up to `most`. */
  private chasmBelow(tx: number, ty: number, most: number): number {
    let rows = 0;
    while (rows < most && this.cell(tx, ty + rows) === 'chasm') rows++;
    return rows;
  }

  /** Now and then, under a chasm's north rim running on both sides with the dark deep below, an old pit prop. */
  private addPost(tx: number, ty: number, z: number | undefined): void {
    const v = tileHash(tx, ty);
    const runs = (x: number): boolean => this.cell(x, ty) === 'chasm' && this.ground(x, ty - 1);
    if (v % POST_EVERY !== 0 || !runs(tx - 1) || !runs(tx + 1)) return;
    const depth = this.chasmBelow(tx, ty, POST_DEPTH + 2);
    if (depth < POST_DEPTH) return;
    const post = MINE_SUNKEN_POSTS[(v >>> 8) % MINE_SUNKEN_POSTS.length];
    const shift = ((v >>> 4) % (POST_JITTER * 2 + 1)) - POST_JITTER;
    this.over.push(piece(post, tx * TILE_WIDTH + shift, ty * TILE_HEIGHT + POST_TOP, Math.min(post.h, depth * TILE_HEIGHT - POST_TOP), z));
  }

  /**
   * A slanted wall's tile: its column of the slanted face (north corners), as tall as the rock behind it allows, or of
   * the rim along the slant (south), drawn over whoever stands behind it with the black under it as deep as feet reach.
   */
  private addSlant(tx: number, ty: number): void {
    const slope = this.level.slopes.get(tx + ty * this.level.width);
    if (!slope) return;
    const footLeft = slantFootY(slope, tx, ty, false);
    const dx = tx * TILE_WIDTH;
    if (!isSouthSlope(slope)) {
      this.addSlantFace(slope, tx, ty, footLeft);
      return;
    }
    const strips = MINE_RIM_SLANT[slope.corner === 'sw' ? 'sw' : 'se'];
    const strip: SlantStrip = strips[tx % strips.length];
    const top = footLeft - strip.footLeft - this.raise;
    const z = slantRimDepth(slope, tx, ty);
    this.over.push(piece(strip, dx, top, strip.h, z));
    voidColumn(this.over, MINE_VOID, dx, top + strip.h, z, z);
  }

  private addSlantFace(slope: Slope, tx: number, ty: number, footLeft: number): void {
    const strips = MINE_SLANT_FACES[slope.corner === 'nw' ? 'nw' : 'ne'];
    const strip: SlantStrip = strips[tx % strips.length];
    const rows = this.rockAbove(tx, ty, false);
    const { dy, h, sy } = this.cut(footLeft - strip.footLeft, strip.h, strip.y, ty - rows, rows + 1);
    this.over.push(piece(strip, tx * TILE_WIDTH, dy, h, faceDepth(ty), sy));
  }
}

/** Every piece of a mine level's terrain, floors first. */
export function buildMineTerrain(level: Level): TerrainPiece[] {
  return new MineTerrainBuilder(level).build();
}
