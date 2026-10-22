import type { Rectangle } from 'pixi.js';
import { createTile, TileType, TILE_WIDTH, TILE_HEIGHT } from './TileType';
import type { TileData } from './TileType';
import { BoxPool } from '../core/geometry';
import { forEachTile } from './Grid';

export type SpawnPoint = { x: number; y: number };

/**
 * A wall with walkable floor directly north of it lets characters step this far
 * into its tile; that wall row is drawn over them, so they appear to stand
 * behind it with only their upper body showing, as in Catacomb Snatch.
 */
export const WALL_SINK = 26;

/** Floor tiles come in this many image variants. */
const FLOOR_VARIANTS = 4;

/** Decoration painted onto the brick face of a wall tile (the tile directly above a floor). */
export type WallDecor = 'niche0' | 'niche1';

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
  /** Top-left tiles of 2×2 pits (each is four Hole tiles drawn as one framed pit). */
  readonly pits: Array<{ x: number; y: number }> = [];

  readonly seen: boolean[];
  tilesDirty = false;
  /** Bumped on every tile change, so caches built from the tiles (enemy step costs) know to rebuild. */
  revision = 0;

  /** Collision boxes handed out by getClipBBs, reused call after call (an object pool). */
  private readonly clipPool = new BoxPool();
  private readonly clipBoxes: Rectangle[] = [];

  constructor(width: number, height: number) {
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

  markSafeZone(tx: number, ty: number): void {
    this.safeZoneSet.add(tx + ty * this.width);
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
    this.seen[tileX + tileY * w] = true;
    this.seen[tileX + 1 + tileY * w] = true;
    this.seen[tileX + (tileY + 1) * w] = true;
    this.seen[tileX + 1 + (tileY + 1) * w] = true;
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
      if (!isWallType(this.getTile(xx, yy))) continue;
      // South faces are two tiles tall, so reveal the cap row as well.
      if (yy > 0) this.markSeen(xx, yy - 1);
      return;
    }
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

  /** Adds the collision box of one tile, if it blocks; a wall with floor north of it lets feet sink in. */
  private readonly addTileClip = (tx: number, ty: number): void => {
    const tile = this.getTile(tx, ty);
    if (tile && tile.passable) return;
    const sink = isWallType(tile) && this.getTile(tx, ty - 1)?.passable ? WALL_SINK : 0;
    this.clipBoxes.push(this.clipPool.between(
      tx * TILE_WIDTH, ty * TILE_HEIGHT + sink,
      (tx + 1) * TILE_WIDTH, (ty + 1) * TILE_HEIGHT,
    ));
  };

  /** Whether nothing but open floor, furniture or pits lies between two points: only walls block sight. */
  checkLineOfSight(x0: number, y0: number, x1: number, y1: number): boolean {
    let tx0 = Math.floor(x0 / TILE_WIDTH);
    let ty0 = Math.floor(y0 / TILE_HEIGHT);
    const tx1 = Math.floor(x1 / TILE_WIDTH);
    const ty1 = Math.floor(y1 / TILE_HEIGHT);
    const dx = Math.abs(tx1 - tx0); const dy = Math.abs(ty1 - ty0);
    const sx = tx0 < tx1 ? 1 : -1; const sy = ty0 < ty1 ? 1 : -1;
    let err = dx - dy;
    while (tx0 !== tx1 || ty0 !== ty1) {
      const tile = this.getTile(tx0, ty0);
      if (!tile || isWallType(tile)) return false;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; tx0 += sx; }
      if (e2 < dx) { err += dx; ty0 += sy; }
    }
    return true;
  }

  addSpawnPoint(x: number, y: number): void {
    this.spawnPoints.push({ x, y });
  }

  /** Replaces all respawn points with a single one. */
  setSpawnPoint(x: number, y: number): void {
    this.spawnPoints = [{ x, y }];
  }

  getRandomSpawnPoint(): SpawnPoint | null {
    if (this.spawnPoints.length === 0) return null;
    return this.spawnPoints[Math.floor(Math.random() * this.spawnPoints.length)];
  }
}
