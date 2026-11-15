import type { Level, Stairs } from './Level';
import { STAIRS_PASSAGE, STAIRS_ROWS, STAIRS_SPAN } from './Level';
import type { TerrainPiece } from './TerrainAutotile';
import { TileType, TILE_HEIGHT, TILE_WIDTH, WALL_SINK } from './TileType';
import { forEachTile, someTile, tileHash } from './Grid';
import {
  CHASM_LIP_S, CHASM_RIM_E, CHASM_RIM_N, CHASM_RIM_W, FACE_END_LEFT, FACE_END_RIGHT, FACE_H, FACE_PILASTER, FACE_XS, FACE_Y,
  FLOOR_BLOCKS, ISO_DECOR, ISO_FLOORS, ISO_VOID, SIDE_STAIRS_EAST, SIDE_STAIRS_WEST, SLANT_FACE, STEPS, SUNKEN_COLUMNS, WALL_NUB_NE,
  WALL_NUB_NW, WALL_RIM_E, WALL_RIM_N, WALL_RIM_NE, WALL_RIM_NW, WALL_RIM_SLANT, WALL_RIM_W, isIsoDecor,
} from './IsoTiles';
import type { IsoDecorArt, IsoRect, SlantStrip } from './IsoTiles';
import type { Slope } from './Slopes';
import { isSouthSlope } from './Slopes';

/**
 * Autotiles the isometric castle (Theme 'castle2') on its 32 px tiles, from the art mapped in IsoTiles.ts. What a tile
 * shows follows from what is round it:
 * - floor: its tone's slabs (and under the slants, whose art covers the wall's part of the tile);
 * - a wall with floor below it is the foot of a face two tiles tall (the stone, its cap, its ends and pilasters);
 * - a wall cutting a north corner off on the slant shows its face on the slant, a south one a rim along it;
 * - every other wall is dark, rimmed in stone where floor touches it; a chasm likewise, its rims darker, its south side
 *   only the floor's lip. Columns sink into the deep dark: under a rim now and then, and out in the dark on their own.
 * Stairs and the decor set into the faces go on top. Faces stand behind whoever is in front of them; the rims along a
 * room's south side (straight or slanted) and a chasm's north rim are drawn among the entities, over the feet of
 * whoever steps up to them (Level's WALL_SINK), as the other themes' south walls are.
 */

/** Ground under foot (floor, a prop's tile, a pit), a wall (or off the map), a chasm, or a slanted wall's tile. */
type Cell = 'ground' | 'wall' | 'chasm' | 'slope';

/** One plain face column in this many (by hash) has a pilaster. */
const PILASTER_EVERY = 5;
/** A pilaster sits on the line between two tiles: this far left of the tile's own left edge. */
const PILASTER_SHIFT = FACE_PILASTER.w / 2;
/**
 * Under a rim, the dark must run this many tiles deep for a column to sink into it: one wall-top rim in SUNKEN_EVERY,
 * one chasm rim in SUNKEN_EVERY_CHASM, and only where the rim runs on both sides (never at its corner).
 */
const SUNKEN_DEPTH = 3;
const SUNKEN_EVERY = 3;
const SUNKEN_EVERY_CHASM = 2;
/** How far below the rim's top a sunken column's top is, and how deep below the rim its tiles are counted. */
const SUNKEN_TOP = 4;
const SUNKEN_SCAN = 4;
/** A column under a rim stands up to this far either way off its tile's middle (by hash), so a row never lines up. */
const SUNKEN_JITTER = 8;
/**
 * Columns standing on their own out in the dark, a row or more below its rim: one deep dark tile in LONE_EVERY (by
 * hash) with the dark all round it, its top LONE_TOP_MIN to LONE_TOP_MIN + LONE_TOP_SPAN down the tile.
 */
const LONE_EVERY = 5;
const LONE_EVERY_CHASM = 3;
const LONE_TOP_MIN = 2;
const LONE_TOP_SPAN = 20;
/** A slanted face rises over this many tiles above its slope tile (its art is 80 px tall). */
const SLANT_FACE_ROWS = 3;
/** The side stairs' feet stand this far below the corridor's south edge (on the rim's lip, as the art's base rows). */
const SIDE_STAIRS_FOOT = 0;
/** A south slant's rim is laid over whoever stands just behind it: sorted a pixel past the deepest feet reach. */
const RIM_DEPTH_BIAS = 1;

/** A piece of the walls' sheet (the level's own tileset) at (dx, dy). */
function wallPiece(r: IsoRect, dx: number, dy: number, h = r.h, z?: number): TerrainPiece {
  return z === undefined ? { dx, dy, sx: r.x, sy: r.y, w: r.w, h } : { dx, dy, sx: r.x, sy: r.y, w: r.w, h, z };
}

/** A piece of the floors' sheet (chasm rims, sunken columns) at (dx, dy). */
function floorSheetPiece(r: IsoRect, dx: number, dy: number, h = r.h, z?: number): TerrainPiece {
  const piece: TerrainPiece = { dx, dy, sx: r.x, sy: r.y, w: r.w, h, sheet: ISO_FLOORS };
  if (z !== undefined) piece.z = z;
  return piece;
}

/** The tone (FLOOR_BLOCKS index) the floor of a tile is laid in: the last zone holding it, else the first tone. */
export function isoFloorTone(level: Level, tx: number, ty: number): number {
  for (let i = level.floorZones.length - 1; i >= 0; i--) {
    const z = level.floorZones[i];
    if (tx >= z.x && ty >= z.y && tx < z.x + z.w && ty < z.y + z.h) return z.tone;
  }
  return 0;
}

/** Where in the floors' sheet a tile's slab is: its tone's block, laid by position so the diamonds run on. */
export function isoFloorSource(level: Level, tx: number, ty: number): { sx: number; sy: number } {
  const block = FLOOR_BLOCKS[isoFloorTone(level, tx, ty)] ?? FLOOR_BLOCKS[0];
  return { sx: block.x + ((tx * TILE_WIDTH) % block.w), sy: block.y + ((ty * TILE_HEIGHT) % block.h) };
}

/** Where a slant crosses a slope tile's left (or right) edge, in world y. */
export function slantFootY(slope: Slope, tx: number, ty: number, right: boolean): number {
  const mirrored = slope.corner === 'ne' || slope.corner === 'se';
  const flipped = slope.corner === 'sw' || slope.corner === 'se';
  const across = right !== mirrored ? 1 : 0;
  const down = (slope.major ? 1 : 0.5) - across / 2;
  return (ty + (flipped ? 1 - down : down)) * TILE_HEIGHT;
}

/**
 * The depth a south slant's rim sorts at, and how far down its dark must reach: past the deepest feet can step behind
 * it in its tile (its lower end, WALL_SINK on).
 */
export function slantRimDepth(slope: Slope, tx: number, ty: number): number {
  return Math.max(slantFootY(slope, tx, ty, false), slantFootY(slope, tx, ty, true)) + WALL_SINK + RIM_DEPTH_BIAS;
}

/**
 * Black laid from `top` down to `bottom` in a column a tile wide (tile-sized pieces, the last cut short), sorted at `z`:
 * the dark under a south rim that whoever stands behind it sinks into.
 */
export function voidColumn(out: TerrainPiece[], void_: IsoRect, dx: number, top: number, bottom: number, z: number, sheet?: string): void {
  for (let y = top; y < bottom; y += void_.h) {
    const piece: TerrainPiece = { dx, dy: y, sx: void_.x, sy: void_.y, w: void_.w, h: Math.min(void_.h, bottom - y), z };
    if (sheet) piece.sheet = sheet;
    out.push(piece);
  }
}

class IsoTerrainBuilder {
  private readonly floors: TerrainPiece[] = [];
  private readonly walls: TerrainPiece[] = [];
  private readonly over: TerrainPiece[] = [];

  constructor(private readonly level: Level) {}

  build(): TerrainPiece[] {
    const { level } = this;
    forEachTile(0, 0, level.width - 1, level.height - 1, this.addTile);
    for (const s of level.stairs) this.addStairs(s);
    for (const [index, decor] of level.wallDecor) {
      if (isIsoDecor(decor)) this.addDecor(index % level.width, Math.floor(index / level.width), ISO_DECOR[decor]);
    }
    return [...this.floors, ...this.walls, ...this.over];
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

  /** Either row of a face. */
  private isFace(tx: number, ty: number): boolean {
    return this.faceFoot(tx, ty) || this.faceFoot(tx, ty + 1);
  }

  /** Ground beside a wall top or chasm, or the end of a face beside it: its rim runs down that side. */
  private rimmedBeside(tx: number, ty: number): boolean {
    return this.ground(tx, ty) || this.isFace(tx, ty);
  }

  // ── Per tile ─────────────────────────────────────────────────────────────────

  private readonly addTile = (tx: number, ty: number): void => {
    const cell = this.cell(tx, ty);
    if (cell === 'ground' || cell === 'slope') this.addFloor(tx, ty);
    if (cell === 'slope') this.addSlant(tx, ty);
    else if (cell === 'chasm') this.addChasm(tx, ty);
    else if (cell === 'wall' && this.faceFoot(tx, ty)) this.addFace(tx, ty);
    else if (cell === 'wall' && !this.isFace(tx, ty)) this.addWallTop(tx, ty);
  };

  private addFloor(tx: number, ty: number): void {
    const { sx, sy } = isoFloorSource(this.level, tx, ty);
    this.floors.push({ dx: tx * TILE_WIDTH, dy: ty * TILE_HEIGHT, sx, sy, w: TILE_WIDTH, h: TILE_HEIGHT, sheet: ISO_FLOORS, floor: true });
  }

  /** A face from its foot tile up: a plain stretch, ended where the face ends, with a pilaster now and then. */
  private addFace(tx: number, ty: number): void {
    const dx = tx * TILE_WIDTH;
    const dy = (ty + 1) * TILE_HEIGHT - FACE_H;
    this.walls.push({ dx, dy, sx: FACE_XS[tx & 3], sy: FACE_Y, w: TILE_WIDTH, h: FACE_H });
    const endsLeft = !this.faceFoot(tx - 1, ty);
    const endsRight = !this.faceFoot(tx + 1, ty);
    if (endsLeft) this.over.push(wallPiece(FACE_END_LEFT, dx, dy));
    if (endsRight) this.over.push(wallPiece(FACE_END_RIGHT, dx + TILE_WIDTH - FACE_END_RIGHT.w, dy));
    const pilaster = !endsLeft && !this.decorAround(tx, ty) && tileHash(tx, ty) % PILASTER_EVERY === 0;
    if (pilaster) this.over.push(wallPiece(FACE_PILASTER, dx - PILASTER_SHIFT, dy));
  }

  /** Whether decor is set into the face at this foot tile or the one left of it (a pilaster there would cut it). */
  private decorAround(tx: number, ty: number): boolean {
    const i = tx + ty * this.level.width;
    return this.level.wallDecor.has(i) || this.level.wallDecor.has(i - 1);
  }

  /**
   * A wall top: dark, with a rim on each side floor touches, the corners where two rims meet, and columns in the dark.
   * One with floor north of it is a room's (or corridor's) south edge: drawn over whoever steps up to it.
   */
  private addWallTop(tx: number, ty: number): void {
    const dx = tx * TILE_WIDTH;
    const dy = ty * TILE_HEIGHT;
    const north = this.ground(tx, ty - 1);
    const z = north ? (ty + 1) * TILE_HEIGHT : undefined;
    const west = this.rimmedBeside(tx - 1, ty);
    const east = this.rimmedBeside(tx + 1, ty);
    const out = z === undefined ? this.walls : this.over;
    if (north) out.push(wallPiece(WALL_RIM_N[tx & 3], dx, dy, WALL_RIM_N[0].h, z));
    if (west) out.push(wallPiece(WALL_RIM_W, dx, dy, WALL_RIM_W.h, z));
    if (east) out.push(wallPiece(WALL_RIM_E, dx + TILE_WIDTH - WALL_RIM_E.w, dy, WALL_RIM_E.h, z));
    if (north && west) this.over.push(wallPiece(WALL_RIM_NW, dx, dy, WALL_RIM_NW.h, z));
    if (north && east) this.over.push(wallPiece(WALL_RIM_NE, dx + TILE_WIDTH - WALL_RIM_NE.w, dy, WALL_RIM_NE.h, z));
    if (!north && !west && this.ground(tx - 1, ty - 1)) this.over.push(wallPiece(WALL_NUB_NW, dx, dy));
    if (!north && !east && this.ground(tx + 1, ty - 1)) this.over.push(wallPiece(WALL_NUB_NE, dx + TILE_WIDTH - WALL_NUB_NE.w, dy));
    if (north) this.addSunkenColumn(tx, ty, SUNKEN_EVERY, z);
    else this.addLoneColumn(tx, ty, LONE_EVERY);
  }

  /** A chasm tile: the darker rims of the great pit, and only the floor's lip where floor lies south of it. */
  private addChasm(tx: number, ty: number): void {
    const dx = tx * TILE_WIDTH;
    const dy = ty * TILE_HEIGHT;
    const north = this.ground(tx, ty - 1);
    // Its north rim hangs over the feet of whoever stands at its edge, as a wall's does.
    if (north) this.over.push(floorSheetPiece(CHASM_RIM_N[tx & 3], dx, dy, CHASM_RIM_N[0].h, (ty + 1) * TILE_HEIGHT));
    if (this.ground(tx, ty + 1)) {
      const lip = CHASM_LIP_S[tx & 3];
      this.walls.push(floorSheetPiece(lip, dx, dy + TILE_HEIGHT - lip.h));
    }
    if (this.ground(tx - 1, ty)) this.walls.push(floorSheetPiece(CHASM_RIM_W, dx, dy));
    if (this.ground(tx + 1, ty)) this.walls.push(floorSheetPiece(CHASM_RIM_E, dx + TILE_WIDTH - CHASM_RIM_E.w, dy));
    if (north) this.addSunkenColumn(tx, ty, SUNKEN_EVERY_CHASM, (ty + 1) * TILE_HEIGHT);
    else this.addLoneColumn(tx, ty, LONE_EVERY_CHASM);
  }

  /**
   * Now and then, under a rim with the dark deep below it, a column sinking from the floor's edge into the dark: only
   * where the rim runs on to either side (never at its corner), a little off the tile's middle.
   */
  private addSunkenColumn(tx: number, ty: number, every: number, z: number | undefined): void {
    const v = tileHash(tx, ty);
    if (v % every !== 0 || !this.rimRunsOn(tx, ty)) return;
    const depth = this.darkBelow(tx, ty);
    if (depth < SUNKEN_DEPTH) return;
    const column = SUNKEN_COLUMNS[(v >>> 8) % SUNKEN_COLUMNS.length];
    const h = Math.min(column.h, depth * TILE_HEIGHT - SUNKEN_TOP);
    const shift = ((v >>> 4) % (SUNKEN_JITTER * 2 + 1)) - SUNKEN_JITTER;
    this.over.push(floorSheetPiece(column, tx * TILE_WIDTH + shift, ty * TILE_HEIGHT + SUNKEN_TOP, h, z));
  }

  /** Whether the rim over (tx, ty) runs on along both neighbours (the same kind of dark, floor north of each). */
  private rimRunsOn(tx: number, ty: number): boolean {
    const kind = this.cell(tx, ty);
    const runs = (x: number): boolean => this.cell(x, ty) === kind && this.ground(x, ty - 1) && !this.isFace(x, ty);
    return runs(tx - 1) && runs(tx + 1);
  }

  /** How many tiles of deep dark run down from (tx, ty), up to SUNKEN_SCAN, with no face drawn over them. */
  private darkBelow(tx: number, ty: number): number {
    let depth = 0;
    while (depth < SUNKEN_SCAN && this.deepBelow(tx, ty + depth) && !this.faceNear(tx, ty + depth)) depth++;
    return depth;
  }

  /**
   * Whether a face is drawn over the tile or those beside it (a column standing there would show through it): a
   * straight face's rows, or the dark a slanted face rises into, up to SLANT_FACE_ROWS above its slope tile.
   */
  private faceNear(tx: number, ty: number): boolean {
    return someTile(tx - 1, ty, tx + 1, ty + SLANT_FACE_ROWS, (x, y) => (y === ty && this.isFace(x, y)) || (y > ty && this.northSlope(x, y)));
  }

  private northSlope(tx: number, ty: number): boolean {
    const slope = this.level.slopes.get(tx + ty * this.level.width);
    return !!slope && !isSouthSlope(slope);
  }

  /**
   * Now and then a column standing on its own out in the dark: a tile of deep dark below the rim's row, with the dark
   * all round it and running deep under it, its top somewhere down the tile.
   */
  private addLoneColumn(tx: number, ty: number, every: number): void {
    const v = tileHash(tx, ty);
    if (v % every !== 0 || !this.ground(tx, ty - 2) || !this.darkAround(tx, ty)) return;
    const depth = this.darkBelow(tx, ty);
    if (depth < SUNKEN_DEPTH) return;
    const column = SUNKEN_COLUMNS[(v >>> 8) % SUNKEN_COLUMNS.length];
    const top = LONE_TOP_MIN + ((v >>> 4) % LONE_TOP_SPAN);
    const shift = ((v >>> 12) % (SUNKEN_JITTER * 2 + 1)) - SUNKEN_JITTER;
    const h = Math.min(column.h, depth * TILE_HEIGHT - top);
    this.over.push(floorSheetPiece(column, tx * TILE_WIDTH + shift, ty * TILE_HEIGHT + top, h));
  }

  /** Whether the tile and the tiles beside it and above it are all deep dark (no rim, face or floor near). */
  private darkAround(tx: number, ty: number): boolean {
    const dark = (x: number, y: number): boolean => {
      const cell = this.cell(x, y);
      return (cell === 'wall' || cell === 'chasm') && !this.isFace(x, y) && !this.ground(x - 1, y) && !this.ground(x + 1, y);
    };
    return dark(tx, ty) && dark(tx - 1, ty) && dark(tx + 1, ty) && dark(tx, ty - 1);
  }

  /** Dark all the way through: a wall top or chasm that is no face, with no ground (or a chasm's lip) below it. */
  private deepBelow(tx: number, ty: number): boolean {
    const cell = this.cell(tx, ty);
    if (cell !== 'wall' && cell !== 'chasm') return false;
    return !this.isFace(tx, ty) && !this.ground(tx, ty + 1);
  }

  /**
   * A slanted wall's tile: its column of the slanted face (north corners), or of the rim along the slant (south), drawn
   * over whoever stands behind it with the dark under it reaching as deep as their feet can.
   */
  private addSlant(tx: number, ty: number): void {
    const slope = this.level.slopes.get(tx + ty * this.level.width);
    if (!slope) return;
    const footLeft = slantFootY(slope, tx, ty, false);
    const dx = tx * TILE_WIDTH;
    if (!isSouthSlope(slope)) {
      const strip: SlantStrip = SLANT_FACE[slope.corner === 'nw' ? 'nw' : 'ne'];
      this.walls.push(wallPiece(strip, dx, footLeft - strip.footLeft));
      return;
    }
    const strip: SlantStrip = WALL_RIM_SLANT[slope.corner === 'sw' ? 'sw' : 'se'];
    const top = footLeft - strip.footLeft;
    const z = slantRimDepth(slope, tx, ty);
    this.over.push(wallPiece(strip, dx, top, strip.h, z));
    voidColumn(this.over, ISO_VOID, dx, top + strip.h, z, z);
  }

  // ── Stairs and decor ─────────────────────────────────────────────────────────

  /**
   * A flight of stairs in a corridor: steps across a north–south one (STAIRS_ROWS tiles of them), or up and over an
   * east–west one, seen from the side (up, a landing, down; as the art's U has them either side of its steps): their feet
   * on the corridor's south edge, their top steps a little up its north face.
   */
  private addStairs(s: Stairs): void {
    const dx = s.x * TILE_WIDTH;
    if (s.dir === 'across') {
      for (let row = 0; row < STAIRS_ROWS; row++) this.over.push(wallPiece(STEPS, dx, (s.y + row) * TILE_HEIGHT));
      return;
    }
    const foot = (s.y + STAIRS_PASSAGE) * TILE_HEIGHT + SIDE_STAIRS_FOOT;
    this.over.push(wallPiece(SIDE_STAIRS_EAST, dx, foot - SIDE_STAIRS_EAST.h));
    this.over.push(wallPiece(SIDE_STAIRS_WEST, dx + (STAIRS_SPAN - 1) * TILE_WIDTH, foot - SIDE_STAIRS_WEST.h));
  }

  /**
   * Decor set into a face from tile (tx, ty): centred on its tiles of a straight face, its foot just above the floor;
   * on a slanted face, its foot following the slant from the decor's first column.
   */
  private addDecor(tx: number, ty: number, art: IsoDecorArt): void {
    if (!art.slant) {
      const dx = tx * TILE_WIDTH + (art.span * TILE_WIDTH - art.w) / 2;
      this.over.push(wallPiece(art, Math.round(dx), (ty + 1) * TILE_HEIGHT - art.lift - art.h));
      return;
    }
    const slope = this.level.slopes.get(tx + ty * this.level.width);
    if (!slope) return;
    // Its lowest corner rests on the slant: the left one on a north-west slant, the right one on a north-east slant.
    const lowLeft = slope.corner === 'nw';
    const footLeft = slantFootY(slope, tx, ty, false);
    const foot = lowLeft ? footLeft : footLeft + (art.w * TILE_HEIGHT) / (2 * TILE_WIDTH);
    this.over.push(wallPiece(art, tx * TILE_WIDTH, foot - art.lift - art.h));
  }
}

/** Every piece of an isometric castle's terrain, floors first. */
export function buildIsoTerrain(level: Level): TerrainPiece[] {
  return new IsoTerrainBuilder(level).build();
}
