import type { Level } from './Level';
import { STAIRS_H, STAIRS_W } from './Level';
import type { TerrainPiece } from './TerrainAutotile';
import { TileType, TILE_HEIGHT, TILE_WIDTH } from './TileType';
import { forEachTile, tileHash } from './Grid';
import {
  CHASM_LIP_S, CHASM_RIM_E, CHASM_RIM_N, CHASM_RIM_W, FACE_END_LEFT, FACE_END_RIGHT, FACE_H, FACE_PILASTER, FACE_XS, FACE_Y,
  FLOOR_BLOCKS, ISO_DECOR, ISO_FLOORS, SLANT_FACE, STAIR_CHEEK_LEFT, STAIR_CHEEK_RIGHT, STEPS, SUNKEN_COLUMNS, WALL_NUB_NE,
  WALL_NUB_NW, WALL_RIM_E, WALL_RIM_N, WALL_RIM_NE, WALL_RIM_NW, WALL_RIM_SLANT, WALL_RIM_W, isIsoDecor,
} from './IsoTiles';
import type { IsoDecorArt, IsoRect, SlantStrip } from './IsoTiles';
import type { Slope } from './Slopes';

/**
 * Autotiles the isometric castle (Theme 'iso') on its 32 px tiles, from the art mapped in IsoTiles.ts. What a tile
 * shows follows from what is round it:
 * - floor: its tone's slabs (and under the slants, whose art covers the wall's part of the tile);
 * - a wall with floor below it is the foot of a face two tiles tall (the stone, its cap, its ends and pilasters);
 * - a wall cutting a north corner off on the slant shows its face on the slant, a south one a rim along it;
 * - every other wall is dark, rimmed in stone where floor touches it; a chasm likewise, its rims darker, its south side
 *   only the floor's lip. Where the dark under a rim runs deep, a column sinks into it now and then.
 * Stairs and the decor set into the faces go on top. Nothing here is drawn among the entities: every face is behind
 * whoever stands in front of it, and the rims lie at the floor's edge.
 */

/** Ground under foot (floor, a prop's tile, a pit), a wall (or off the map), a chasm, or a slanted wall's tile. */
type Cell = 'ground' | 'wall' | 'chasm' | 'slope';

/** One plain face column in this many (by hash) has a pilaster. */
const PILASTER_EVERY = 5;
/** A pilaster sits on the line between two tiles: this far left of the tile's own left edge. */
const PILASTER_SHIFT = FACE_PILASTER.w / 2;
/**
 * Under a rim, the dark must run this many tiles deep for a column to sink into it: one wall-top rim in SUNKEN_EVERY,
 * one chasm rim in SUNKEN_EVERY_CHASM.
 */
const SUNKEN_DEPTH = 3;
const SUNKEN_EVERY = 3;
const SUNKEN_EVERY_CHASM = 2;
/** How far below the rim's top a sunken column's top is, and how deep below the rim its tiles are counted. */
const SUNKEN_TOP = 4;
const SUNKEN_SCAN = 4;
/** Steps overhang the stairs' tiles by this much either side (their art is wider than two tiles). */
const STEPS_OVERHANG = (STEPS.w - STAIRS_W * TILE_WIDTH) / 2;
/** The cheeks stand this far above the steps' foot (as in the art: their feet rest on the second step). */
const CHEEK_RISE = 16;

/** A piece of the walls' sheet (the level's own tileset) at (dx, dy). */
function wallPiece(r: IsoRect, dx: number, dy: number, h = r.h): TerrainPiece {
  return { dx, dy, sx: r.x, sy: r.y, w: r.w, h };
}

/** A piece of the floors' sheet (chasm rims, sunken columns) at (dx, dy). */
function floorSheetPiece(r: IsoRect, dx: number, dy: number, h = r.h): TerrainPiece {
  return { dx, dy, sx: r.x, sy: r.y, w: r.w, h, sheet: ISO_FLOORS };
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

class IsoTerrainBuilder {
  private readonly floors: TerrainPiece[] = [];
  private readonly walls: TerrainPiece[] = [];
  private readonly over: TerrainPiece[] = [];

  constructor(private readonly level: Level) {}

  build(): TerrainPiece[] {
    const { level } = this;
    forEachTile(0, 0, level.width - 1, level.height - 1, this.addTile);
    for (const s of level.stairs) this.addStairs(s.x, s.y);
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

  /** A wall top: dark, with a rim on each side floor touches, the corners where two rims meet, and a sunken column. */
  private addWallTop(tx: number, ty: number): void {
    const dx = tx * TILE_WIDTH;
    const dy = ty * TILE_HEIGHT;
    const north = this.ground(tx, ty - 1);
    const west = this.rimmedBeside(tx - 1, ty);
    const east = this.rimmedBeside(tx + 1, ty);
    if (north) this.walls.push(wallPiece(WALL_RIM_N[tx & 3], dx, dy));
    if (west) this.walls.push(wallPiece(WALL_RIM_W, dx, dy));
    if (east) this.walls.push(wallPiece(WALL_RIM_E, dx + TILE_WIDTH - WALL_RIM_E.w, dy));
    if (north && west) this.over.push(wallPiece(WALL_RIM_NW, dx, dy));
    if (north && east) this.over.push(wallPiece(WALL_RIM_NE, dx + TILE_WIDTH - WALL_RIM_NE.w, dy));
    if (!north && !west && this.ground(tx - 1, ty - 1)) this.over.push(wallPiece(WALL_NUB_NW, dx, dy));
    if (!north && !east && this.ground(tx + 1, ty - 1)) this.over.push(wallPiece(WALL_NUB_NE, dx + TILE_WIDTH - WALL_NUB_NE.w, dy));
    if (north) this.addSunkenColumn(tx, ty, SUNKEN_EVERY);
  }

  /** A chasm tile: the darker rims of the great pit, and only the floor's lip where floor lies south of it. */
  private addChasm(tx: number, ty: number): void {
    const dx = tx * TILE_WIDTH;
    const dy = ty * TILE_HEIGHT;
    const north = this.ground(tx, ty - 1);
    if (north) this.walls.push(floorSheetPiece(CHASM_RIM_N[tx & 3], dx, dy));
    if (this.ground(tx, ty + 1)) {
      const lip = CHASM_LIP_S[tx & 3];
      this.walls.push(floorSheetPiece(lip, dx, dy + TILE_HEIGHT - lip.h));
    }
    if (this.ground(tx - 1, ty)) this.walls.push(floorSheetPiece(CHASM_RIM_W, dx, dy));
    if (this.ground(tx + 1, ty)) this.walls.push(floorSheetPiece(CHASM_RIM_E, dx + TILE_WIDTH - CHASM_RIM_E.w, dy));
    if (north) this.addSunkenColumn(tx, ty, SUNKEN_EVERY_CHASM);
  }

  /** Now and then, under a rim with the dark deep below it, a column sinking from the floor's edge into the dark. */
  private addSunkenColumn(tx: number, ty: number, every: number): void {
    const v = tileHash(tx, ty);
    if (v % every !== 0) return;
    let depth = 0;
    while (depth < SUNKEN_SCAN && this.deepBelow(tx, ty + depth)) depth++;
    if (depth < SUNKEN_DEPTH) return;
    const column = SUNKEN_COLUMNS[(v >>> 8) % SUNKEN_COLUMNS.length];
    const h = Math.min(column.h, depth * TILE_HEIGHT - SUNKEN_TOP);
    this.over.push(floorSheetPiece(column, tx * TILE_WIDTH, ty * TILE_HEIGHT + SUNKEN_TOP, h));
  }

  /** Dark all the way through: a wall top or chasm that is no face, with no ground (or a chasm's lip) below it. */
  private deepBelow(tx: number, ty: number): boolean {
    const cell = this.cell(tx, ty);
    if (cell !== 'wall' && cell !== 'chasm') return false;
    return !this.isFace(tx, ty) && !this.ground(tx, ty + 1);
  }

  /** A slanted wall's tile: its column of the slanted face (north corners) or of the rim along the slant (south). */
  private addSlant(tx: number, ty: number): void {
    const slope = this.level.slopes.get(tx + ty * this.level.width);
    if (!slope) return;
    const strip: SlantStrip = slope.corner === 'nw' || slope.corner === 'ne' ? SLANT_FACE[slope.corner] : WALL_RIM_SLANT[slope.corner];
    const footLeft = slantFootY(slope, tx, ty, false);
    this.walls.push(wallPiece(strip, tx * TILE_WIDTH, footLeft - strip.footLeft));
  }

  // ── Stairs and decor ─────────────────────────────────────────────────────────

  /** A flight of stairs down a gallery's face: two tiles of steps, between stone cheeks standing on the face. */
  private addStairs(x: number, y: number): void {
    const left = x * TILE_WIDTH - STEPS_OVERHANG;
    for (let row = 0; row < STAIRS_H; row++) this.over.push(wallPiece(STEPS, left, (y + row) * TILE_HEIGHT));
    const foot = (y + STAIRS_H) * TILE_HEIGHT - CHEEK_RISE;
    this.over.push(wallPiece(STAIR_CHEEK_LEFT, left - STAIR_CHEEK_LEFT.w, foot - STAIR_CHEEK_LEFT.h));
    this.over.push(wallPiece(STAIR_CHEEK_RIGHT, left + STEPS.w, foot - STAIR_CHEEK_RIGHT.h));
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
