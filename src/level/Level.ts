import type { Rectangle } from 'pixi.js';
import { createTile, TileType, TILE_WIDTH, TILE_HEIGHT, WALL_SINK } from './TileType';
import type { TileData } from './TileType';
import { BoxPool } from '../core/geometry';
import { forEachTile } from './Grid';
import type { BlockRect } from './Props';
import { insidePit, pitTileBounds } from './PitShapes';
import type { Pit } from './PitShapes';
import type { LevelTheme } from './Theme';
import { OPEN_CHASMS } from './Theme';
import { CAVE_FACE_SPILL, caveBulgeSolid } from './CaveShape';
import { isSouthSlope, slopeBlocks, slopeClearance, slopePush, slopeSupport } from './Slopes';
import type { Slope } from './Slopes';

export type SpawnPoint = { x: number; y: number };

export { WALL_SINK } from './TileType';

/** Floor tiles come in this many image variants. */
const FLOOR_VARIANTS = 4;

/** Decoration painted onto the brick face of a wall tile (the tile directly above a floor). */
export const WALL_DECORS = [
  'niche0', 'niche1',
  // A castle's decorated stretches of face (level/CastleTiles.ts), each tile numbered from the stretch's left.
  'door0', 'door1', 'glass0', 'glass1', 'ornate0', 'ornate1', 'ornate2', 'ornate3', 'gothic0', 'gothic1', 'gothic2',
  // The isometric castle's (level/IsoTiles.ts ISO_DECOR), each keyed by its first tile: the face's foot tile on a
  // straight face, the slope tile of its first column on a slanted one.
  'isoWindow', 'isoWindow2', 'isoStatue', 'isoStatue2', 'isoShelf', 'isoCrystal', 'isoDoor',
  'isoWindowNW', 'isoStatueNW', 'isoMirrorNW', 'isoCrystalNW', 'isoGroupNW',
  'isoWindowNE', 'isoStatueNE', 'isoMirrorNE', 'isoCrystalNE', 'isoGroupNE',
] as const;
export type WallDecor = (typeof WALL_DECORS)[number];

export function isWallDecor(value: unknown): value is WallDecor {
  return WALL_DECORS.some((decor) => decor === value);
}

/** A castle pool is this many tiles across and down (its art, TerrainAutotile.ts, fits them with a rim). */
export const POOL_W = 4;
export const POOL_H = 3;
export const POOL_KINDS = ['water', 'sludge'] as const;
export type PoolKind = (typeof POOL_KINDS)[number];

/** How many floor tones the isometric castle has (IsoTiles.ts: dark slate, oxblood, teal). */
export const FLOOR_TONES = 3;
/** The most floor tones any theme lays (the mines have four, MineTiles.ts). */
export const MAX_FLOOR_TONES = 4;
/**
 * A stretch of floor laid in one tone (tile box; later zones lie over earlier ones), in the isometric castle and the
 * mines. A `patch` (the mines) is earth of that tone lying on the ground in a ragged ellipse filling the box.
 */
export type FloorZone = { x: number; y: number; w: number; h: number; tone: number; patch?: true };
/**
 * A flight of stairs across a straight north–south corridor two tiles wide: steps STAIRS_PASSAGE tiles across and
 * STAIRS_ROWS tiles tall, from its top-left tile.
 */
export type Stairs = { x: number; y: number };
export const STAIRS_ROWS = 2;
/** The corridors stairs are laid in are this many tiles wide. */
export const STAIRS_PASSAGE = 2;

/** A tile box as forEachTile's arguments. */
function boundsArgs(b: { x0: number; y0: number; x1: number; y1: number }): [number, number, number, number] {
  return [b.x0, b.y0, b.x1, b.y1];
}

/** Both sides of a body's box, for walking its corners. */
const SIDES = [-1, 1] as const;
/** Scratch point for the slope pushes (an object pool of one). */
const slopeScratch = { x: 0, y: 0 };

function isWallType(tile: TileData | null): boolean {
  return tile?.type === TileType.Wall || tile?.type === TileType.BreakableWall;
}

export class Level {
  readonly width: number;
  readonly height: number;

  private tileStacks: TileData[][];
  private spawnPoints: SpawnPoint[] = [];
  private safeZoneSet = new Set<number>();  // packed tileX + tileY * width
  /** Face decorations keyed by packed tile index. */
  readonly wallDecor = new Map<number, WallDecor>();
  /** Tiles (index x + y·width) of cave halls, whose floor is laid with patches of cave ground. */
  readonly caveFloor = new Set<number>();
  /**
   * Tiles (index x + y·width) of a catacomb level's caverns (generators/CaveZone.ts): walls, floor and chasm drawn from
   * the cave set (level/CaveTerrain.ts) instead of the catacombs' bricks.
   */
  readonly caveZone = new Set<number>();
  /** Floor tiles laid as a wooden bridge over a cavern's chasm (drawn as planks over the dark). */
  readonly bridges = new Set<number>();
  /**
   * Obstacle tiles that block less than the whole tile (a prop blocks only a strip at its foot), by tile index,
   * in pixels from the tile's top-left. Obstacles without an entry block the whole tile.
   */
  readonly blockBoxes = new Map<number, BlockRect>();
  /** The pits: each four Hole tiles drawn as one shaped pit (PitShapes.ts). Add them with `addPit`. */
  readonly pits: Pit[] = [];
  /** The pits whose open ground reaches into each tile, by tile index (most tiles have none). */
  private readonly pitTiles = new Map<number, Pit[]>();
  /** Tiles (index x + y·width) whose wall faces are cobblestone rather than brick. */
  readonly cobbleWalls = new Set<number>();
  /** Top-left tiles of framed 2×2 drain grates set into the floor (walked over: decor only). */
  readonly grates: Array<{ x: number; y: number }> = [];
  /** A castle's pools (water, or green sludge): top-left of their POOL_W×POOL_H obstacle tiles. Add them with `addPool`. */
  readonly pools: Array<{ x: number; y: number; kind: PoolKind }> = [];
  /** The tiles the pools cover, by tile index: nobody wades in, but spells and arrows fly over the water. */
  private readonly poolTiles = new Set<number>();
  /** The isometric castle's slanted walls: the tiles their slants cross, by tile index (Slopes.ts). */
  readonly slopes = new Map<number, Slope>();
  /** The isometric castle's floor tones, laid in order (the floor outside every zone is tone 0). */
  readonly floorZones: FloorZone[] = [];
  /** Flights of stairs in the isometric castle's corridors: their top-left tiles and which way they climb. */
  readonly stairs: Stairs[] = [];

  readonly seen: boolean[];
  /** Bumped whenever a corner is seen for the first time, so the fog redraws only when it changed. */
  seenRevision = 0;
  tilesDirty = false;
  /** Bumped on every tile change, so caches built from the tiles (enemy step costs) know to rebuild. */
  revision = 0;

  /** Collision boxes handed out by getClipBBs, reused call after call (an object pool). */
  private readonly clipPool = new BoxPool();
  private readonly clipBoxes: Rectangle[] = [];

  constructor(width: number, height: number, readonly theme: LevelTheme = 'catacomb') {
    this.width = width;
    this.height = height;
    this.tileStacks = [];
    for (let i = 0; i < width * height; i++) {
      this.tileStacks[i] = [createTile(TileType.Floor, Math.floor(Math.random() * FLOOR_VARIANTS))];
    }
    this.seen = new Array((width + 1) * (height + 1)).fill(false);
  }

  /** Packed index of a tile, as the tile graph numbers it. */
  tileIndex(tx: number, ty: number): number {
    return tx + ty * this.width;
  }

  /** Packed index of the tile under a world-space point. */
  tileIndexAt(worldX: number, worldY: number): number {
    return this.tileIndex(Math.floor(worldX / TILE_WIDTH), Math.floor(worldY / TILE_HEIGHT));
  }

  /** World-space centre of a packed tile index. */
  tileCentreX(index: number): number {
    return (index % this.width) * TILE_WIDTH + TILE_WIDTH / 2;
  }

  tileCentreY(index: number): number {
    return Math.floor(index / this.width) * TILE_HEIGHT + TILE_HEIGHT / 2;
  }

  addPool(pool: { x: number; y: number; kind: PoolKind }): void {
    this.pools.push(pool);
    forEachTile(pool.x, pool.y, pool.x + POOL_W - 1, pool.y + POOL_H - 1, (tx, ty) => this.poolTiles.add(tx + ty * this.width));
  }

  addPit(pit: Pit): void {
    this.pits.push(pit);
    forEachTile(...boundsArgs(pitTileBounds(pit)), (tx, ty) => {
      const i = tx + ty * this.width;
      const list = this.pitTiles.get(i);
      if (list) list.push(pit);
      else this.pitTiles.set(i, [pit]);
    });
  }

  /** Whether some pit's ground reaches into the tile (its Hole tiles, and the floor its lobes bulge into). */
  hasPit(tx: number, ty: number): boolean {
    return this.pitTiles.has(tx + ty * this.width);
  }

  /** The pit whose open ground the world point is over, if any. */
  pitAt(worldX: number, worldY: number): Pit | null {
    const list = this.pitTiles.get(this.tileIndexAt(worldX, worldY));
    if (!list) return null;
    for (const pit of list) if (insidePit(pit, worldX, worldY)) return pit;
    return null;
  }

  /**
   * Whether a world point is over open pit, where feet find no floor: inside a pit's drawn shape (its lobes too, and
   * not the corners of a quatrefoil's tiles), or on a Hole tile that belongs to no pit.
   */
  overPit(worldX: number, worldY: number): boolean {
    if (this.pitTiles.has(this.tileIndexAt(worldX, worldY))) return this.pitAt(worldX, worldY) !== null;
    return this.getTileAt(worldX, worldY)?.type === TileType.Hole;
  }

  /**
   * Whether a tile is part of a chasm: a Hole that belongs to no pit. Sight, spells and arrows cross it; whether anyone
   * can step into it (and fall) or it is only a gap depends on the theme (Theme.ts OPEN_CHASMS).
   */
  isChasm(tx: number, ty: number): boolean {
    return this.getTile(tx, ty)?.type === TileType.Hole && !this.hasPit(tx, ty);
  }

  /**
   * The row of the slope tile whose slant decides where a tile's wall begins: the tile's own, or for the wall tile under
   * a south slant (which feet reach into, Slopes.ts) the one above it; -1 for a tile no slant crosses.
   */
  slopeRow(tx: number, ty: number): number {
    if (this.slopes.has(tx + ty * this.width)) return ty;
    const above = this.slopes.get(tx + (ty - 1) * this.width);
    return above && isSouthSlope(above) && isWallType(this.getTile(tx, ty)) ? ty - 1 : -1;
  }

  /** Whether a world point lies on the wall's side of a slanted wall (Slopes.ts); false off the slants. */
  inSlopeWall(worldX: number, worldY: number): boolean {
    const tx = Math.floor(worldX / TILE_WIDTH);
    const sy = this.slopeRow(tx, Math.floor(worldY / TILE_HEIGHT));
    const slope = sy < 0 ? undefined : this.slopes.get(tx + sy * this.width);
    return !!slope && slopeBlocks(slope, tx, sy, worldX, worldY);
  }

  /**
   * Pushes a body (its box `r` round `pos`) back out of any slanted wall it has moved into, straight back over the
   * slant, so it slides along it. Each of its box's corners is checked against the slope tile it lies in.
   */
  pushOutOfSlopes(pos: { x: number; y: number }, rx: number, ry: number): void {
    if (this.slopes.size === 0) return;
    for (const sx of SIDES) {
      for (const sy of SIDES) this.pushCornerOut(pos, rx, ry, pos.x + sx * rx, pos.y + sy * ry);
    }
  }

  /**
   * One corner of a body's box: if a slant decides its tile and the corner is past it, back it out. The corner facing the
   * wall reaches deepest into a slant, so another corner is measured only where that one finds no part of the same slant
   * under it: at the point of a spur, where two slants meet back to back and each corner of the box lies over the other's.
   */
  private pushCornerOut(pos: { x: number; y: number }, rx: number, ry: number, cornerX: number, cornerY: number): void {
    const tx = Math.floor(cornerX / TILE_WIDTH);
    const ty = this.slopeRow(tx, Math.floor(cornerY / TILE_HEIGHT));
    const slope = ty < 0 ? undefined : this.slopes.get(tx + ty * this.width);
    if (!slope) return;
    slopeSupport(slope, pos.x, pos.y, rx, ry, slopeScratch);
    const facing = slopeScratch.x === cornerX && slopeScratch.y === cornerY;
    if (!facing && this.slopeAt(slopeScratch.x, slopeScratch.y)?.corner === slope.corner) return;
    const clearance = slopeClearance(slope, tx, ty, cornerX, cornerY);
    if (clearance >= 0) return;
    slopePush(slope, -clearance, slopeScratch);
    pos.x += slopeScratch.x;
    pos.y += slopeScratch.y;
  }

  /** The slope whose slant decides where the wall begins at a world point, if any. */
  private slopeAt(worldX: number, worldY: number): Slope | undefined {
    const tx = Math.floor(worldX / TILE_WIDTH);
    const ty = this.slopeRow(tx, Math.floor(worldY / TILE_HEIGHT));
    return ty < 0 ? undefined : this.slopes.get(tx + ty * this.width);
  }

  markSafeZone(tx: number, ty: number): void {
    this.safeZoneSet.add(tx + ty * this.width);
  }

  /** Every safe-zone tile (packed index), for saving the map. */
  get safeZoneTiles(): ReadonlySet<number> {
    return this.safeZoneSet;
  }

  /** Where fallen players come back, for saving the map. */
  get respawnPoints(): readonly SpawnPoint[] {
    return this.spawnPoints;
  }

  isSafeZone(tx: number, ty: number): boolean {
    return this.safeZoneSet.has(tx + ty * this.width);
  }

  /** Returns true if world-space point is inside any safe zone tile. */
  isWorldPosSafe(wx: number, wy: number): boolean {
    const tx = Math.floor(wx / TILE_WIDTH);
    const ty = Math.floor(wy / TILE_HEIGHT);
    return this.isSafeZone(tx, ty);
  }

  isSeen(cx: number, cy: number): boolean {
    if (cx < 0 || cy < 0 || cx > this.width || cy > this.height) return false;
    return this.seen[cx + cy * (this.width + 1)];
  }

  markSeen(tileX: number, tileY: number): void {
    const w = this.width + 1;
    this.seeCorner(tileX + tileY * w);
    this.seeCorner(tileX + 1 + tileY * w);
    this.seeCorner(tileX + (tileY + 1) * w);
    this.seeCorner(tileX + 1 + (tileY + 1) * w);
  }

  /** What has been seen, as a string of '1' (seen) and '0' corner by corner: kept in a saved game. */
  seenBits(): string {
    let bits = '';
    for (const corner of this.seen) bits += corner ? '1' : '0';
    return bits;
  }

  /** Brings back what a saved game had seen (bits as seenBits wrote them; a map of another size is ignored). */
  restoreSeen(bits: string): void {
    if (bits.length !== this.seen.length) return;
    for (let i = 0; i < bits.length; i++) if (bits[i] === '1') this.seeCorner(i);
  }

  private seeCorner(index: number): void {
    if (this.seen[index]) return;
    this.seen[index] = true;
    this.seenRevision++;
  }

  reveal(tileX: number, tileY: number, radius: number): void {
    for (let i = 0; i < radius * 2 + 1; i++) {
      this.revealLine(tileX, tileY, tileX - radius + i, tileY - radius, radius);
      this.revealLine(tileX, tileY, tileX - radius + i, tileY + radius, radius);
      this.revealLine(tileX, tileY, tileX - radius, tileY - radius + i, radius);
      this.revealLine(tileX, tileY, tileX + radius, tileY - radius + i, radius);
    }
  }

  /** Marks tiles seen along a ray until it leaves the map, the radius, or meets a wall (which is seen too). */
  private revealLine(x0: number, y0: number, x1: number, y1: number, radius: number): void {
    for (let i = 0; i <= radius; i++) {
      const xx = x0 + Math.trunc(((x1 - x0) * i) / radius);
      const yy = y0 + Math.trunc(((y1 - y0) * i) / radius);
      if (xx < 0 || yy < 0 || xx >= this.width || yy >= this.height) return;
      const dx = xx - x0; const dy = yy - y0;
      if (dx * dx + dy * dy > radius * radius) return;
      this.markSeen(xx, yy);
      this.seeSouthRim(xx, yy);
      if (!isWallType(this.getTile(xx, yy))) continue;
      // South faces are two tiles tall, so reveal the cap row as well.
      if (yy > 0) this.markSeen(xx, yy - 1);
      return;
    }
  }

  /**
   * A south slant's rim and the dark under it reach on into the tile below its own (as far as feet step behind it): seen
   * with it, so the fog doesn't cut the slanted rim into steps along the tiles' edges.
   */
  private seeSouthRim(tx: number, ty: number): void {
    const slope = this.slopes.get(tx + ty * this.width);
    if (slope && isSouthSlope(slope) && ty + 1 < this.height) this.markSeen(tx, ty + 1);
  }

  getTile(x: number, y: number): TileData | null {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return null;
    const stack = this.tileStacks[x + y * this.width];
    return stack[stack.length - 1] ?? null;
  }

  getTileAt(worldX: number, worldY: number): TileData | null {
    return this.getTile(Math.floor(worldX / TILE_WIDTH), Math.floor(worldY / TILE_HEIGHT));
  }

  setTile(x: number, y: number, tile: TileData): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.tileStacks[x + y * this.width] = [tile];
    this.tilesDirty = true;
    this.revision++;
  }

  clearDirty(): void {
    this.tilesDirty = false;
  }

  canPass(worldX: number, worldY: number): boolean {
    const tile = this.getTileAt(worldX, worldY);
    return tile === null ? false : tile.passable;
  }

  /** Whether something set down here lies on the floor: open ground that is not a pit (a pit swallows it). */
  canHold(worldX: number, worldY: number): boolean {
    const tile = this.getTileAt(worldX, worldY);
    return !!tile && tile.passable && tile.type !== TileType.Hole && !this.overPit(worldX, worldY) && !this.inSlopeWall(worldX, worldY);
  }

  /**
   * Whether a point on the ground lies inside the same box a body would bump into (`getClipBBs`): the strip of a
   * wall's tile that feet may sink into, and the part of a prop's tile beside its foot, are open. Spells and arrows
   * fly by this, so a shot drawn at hand height above the floor is not stopped by a wall it has not reached.
   */
  blocksPoint(worldX: number, worldY: number): boolean {
    const tx = Math.floor(worldX / TILE_WIDTH);
    const ty = Math.floor(worldY / TILE_HEIGHT);
    const tile = this.getTile(tx, ty);
    if (!tile) return true;
    if (this.slopeRow(tx, ty) >= 0) return this.inSlopeWall(worldX, worldY);
    if (tile.passable || this.poolTiles.has(tx + ty * this.width)) return false;
    const inX = worldX - tx * TILE_WIDTH;
    const inY = worldY - ty * TILE_HEIGHT;
    const part = tile.type === TileType.Obstacle ? this.blockBoxes.get(tx + ty * this.width) : undefined;
    if (part) return inX >= part.x0 && inX < part.x1 && inY >= part.y0 && inY < part.y1;
    const sink = isWallType(tile) && this.getTile(tx, ty - 1)?.passable ? WALL_SINK : 0;
    return inY >= sink;
  }

  /**
   * Collision boxes of the map's edges and of every solid tile around the box centred at (cx, cy). The
   * array and its boxes are reused by the next call: use them at once, never keep them.
   */
  getClipBBs(cx: number, cy: number, rx: number, ry: number): readonly Rectangle[] {
    const W = this.width * TILE_WIDTH;
    const H = this.height * TILE_HEIGHT;
    const pool = this.clipPool;
    const result = this.clipBoxes;
    pool.reset();
    result.length = 0;
    result.push(
      pool.between(-TILE_WIDTH, 0, 0, H),
      pool.between(0, -TILE_HEIGHT, W, 0),
      pool.between(W, 0, W + TILE_WIDTH, H),
      pool.between(0, H, W, H + TILE_HEIGHT),
    );
    const tx0 = Math.floor((cx - rx) / TILE_WIDTH) - 1;
    const ty0 = Math.floor((cy - ry) / TILE_HEIGHT) - 1;
    const tx1 = Math.ceil((cx + rx) / TILE_WIDTH) + 1;
    const ty1 = Math.ceil((cy + ry) / TILE_HEIGHT) + 1;
    forEachTile(tx0, ty0, tx1, ty1, this.addTileClip);
    return result;
  }

  /**
   * Adds the collision box of one tile, if it blocks: a wall with floor north of it lets feet sink in, and
   * a prop blocks only the strip at its foot.
   */
  private readonly addTileClip = (tx: number, ty: number): void => {
    const tile = this.getTile(tx, ty);
    // Slanted walls push bodies back themselves (pushOutOfSlopes); nobody steps into a chasm that is only a gap, but feet
    // reach over its north rim as over a wall's. One that is a drop stops nobody: whoever walks out over it falls.
    if (this.slopeRow(tx, ty) >= 0) return;
    if (this.isChasm(tx, ty)) {
      if (OPEN_CHASMS[this.theme]) return;
      const rim = this.getTile(tx, ty - 1)?.type === TileType.Floor ? WALL_SINK : 0;
      this.clipBoxes.push(this.clipPool.between(tx * TILE_WIDTH, ty * TILE_HEIGHT + rim, (tx + 1) * TILE_WIDTH, (ty + 1) * TILE_HEIGHT));
      return;
    }
    if (tile && tile.passable) return;
    const part = tile?.type === TileType.Obstacle ? this.blockBoxes.get(tx + ty * this.width) : undefined;
    if (part) {
      if (part.x1 > part.x0 && part.y1 > part.y0) {
        this.clipBoxes.push(this.clipPool.between(tx * TILE_WIDTH + part.x0, ty * TILE_HEIGHT + part.y0, tx * TILE_WIDTH + part.x1, ty * TILE_HEIGHT + part.y1));
      }
      return;
    }
    const sink = isWallType(tile) && this.getTile(tx, ty - 1)?.passable ? WALL_SINK : 0;
    this.clipBoxes.push(this.clipPool.between(
      tx * TILE_WIDTH, ty * TILE_HEIGHT + sink,
      (tx + 1) * TILE_WIDTH, (ty + 1) * TILE_HEIGHT,
    ));
    if (isWallType(tile) && this.caveZone.has(tx + ty * this.width)) this.addCaveRockClip(tx, ty);
  };

  /** Open ground beside a cavern's rock (its rims show there): no wall, no slanted wall's tile. */
  private rockOpen(tx: number, ty: number): boolean {
    const tile = this.getTile(tx, ty);
    return !!tile && !isWallType(tile) && !this.slopes.has(tx + ty * this.width);
  }

  /** A cavern wall also stops bodies where its stones spill over the ground beside and below it (CaveShape.ts). */
  private addCaveRockClip(tx: number, ty: number): void {
    const southOpen = this.rockOpen(tx, ty + 1);
    for (const side of [-1, 1] as const) {
      if (this.rockOpen(tx + side, ty)) this.addBulgeClips(tx, ty, side, southOpen ? 1 : 2, this.rockOpen(tx, ty - 1));
    }
    if (!southOpen) return;
    this.clipBoxes.push(this.clipPool.between(tx * TILE_WIDTH, (ty + 1) * TILE_HEIGHT, (tx + 1) * TILE_WIDTH, (ty + 1) * TILE_HEIGHT + CAVE_FACE_SPILL));
  }

  /**
   * The strips of a wall's side its rim's stones spill over, a quarter row at a time (`rows` of them). Below open ground
   * north (feet reach over a wall's top edge, WALL_SINK) they start as low as the wall's own box does, or they would snag
   * whoever walks along its north side.
   */
  private addBulgeClips(tx: number, ty: number, side: -1 | 1, rows: number, northOpen: boolean): void {
    const half = TILE_HEIGHT / 2;
    for (let row = 0; row < rows; row++) {
      const out = caveBulgeSolid(tx, ty, side, row === 0 ? 0 : 1, northOpen);
      if (out <= 0) continue;
      const x0 = side < 0 ? tx * TILE_WIDTH - out : (tx + 1) * TILE_WIDTH;
      const top = ty * TILE_HEIGHT + Math.max(row * half, northOpen ? WALL_SINK : 0);
      this.clipBoxes.push(this.clipPool.between(x0, top, x0 + out, ty * TILE_HEIGHT + (row + 1) * half));
    }
  }

  /**
   * Whether nothing but open floor, furniture or pits lies between two points: only walls block sight. The
   * tiles the two stand on don't count — feet may sink into a wall's edge, and that wall is behind them.
   */
  checkLineOfSight(x0: number, y0: number, x1: number, y1: number): boolean {
    let tx0 = Math.floor(x0 / TILE_WIDTH);
    let ty0 = Math.floor(y0 / TILE_HEIGHT);
    const tx1 = Math.floor(x1 / TILE_WIDTH);
    const ty1 = Math.floor(y1 / TILE_HEIGHT);
    const dx = Math.abs(tx1 - tx0); const dy = Math.abs(ty1 - ty0);
    const sx = tx0 < tx1 ? 1 : -1; const sy = ty0 < ty1 ? 1 : -1;
    let err = dx - dy;
    for (;;) {
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; tx0 += sx; }
      if (e2 < dx) { err += dx; ty0 += sy; }
      if (tx0 === tx1 && ty0 === ty1) return true;
      const tile = this.getTile(tx0, ty0);
      if (!tile || isWallType(tile)) return false;
    }
  }

  addSpawnPoint(x: number, y: number): void {
    this.spawnPoints.push({ x, y });
  }
}
