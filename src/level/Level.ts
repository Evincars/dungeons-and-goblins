import { createTile, TileType, TILE_WIDTH, TILE_HEIGHT } from './TileType';
import type { TileData } from './TileType';
import { BB } from '../math/BB';

export type SpawnPoint = { x: number; y: number };

const WALL_CLIP_RISE = 6;

export class Level {
  readonly width: number;
  readonly height: number;

  private tileStacks: TileData[][];
  private spawnPoints: SpawnPoint[] = [];

  readonly seen: boolean[];
  tilesDirty = false;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.tileStacks = [];
    for (let i = 0; i < width * height; i++) {
      this.tileStacks[i] = [createTile(TileType.Floor, Math.floor(Math.random() * 4))];
    }
    this.seen = new Array((width + 1) * (height + 1)).fill(false);
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

  private revealLine(x0: number, y0: number, x1: number, y1: number, radius: number): void {
    for (let i = 0; i <= radius; i++) {
      const xx = x0 + Math.trunc(((x1 - x0) * i) / radius);
      const yy = y0 + Math.trunc(((y1 - y0) * i) / radius);
      if (xx < 0 || yy < 0 || xx >= this.width || yy >= this.height) return;
      const dx = xx - x0; const dy = yy - y0;
      if (dx * dx + dy * dy > radius * radius) return;
      const tile = this.getTile(xx, yy);
      if (tile?.type === TileType.Wall || tile?.type === TileType.BreakableWall) {
        this.markSeen(xx, yy);
        return;
      }
      this.markSeen(xx, yy);
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
  }

  clearDirty(): void {
    this.tilesDirty = false;
  }

  canPass(worldX: number, worldY: number): boolean {
    const tile = this.getTileAt(worldX, worldY);
    return tile === null ? false : tile.passable;
  }

  getClipBBs(cx: number, cy: number, rx: number, ry: number): BB[] {
    const W = this.width * TILE_WIDTH;
    const H = this.height * TILE_HEIGHT;
    const result: BB[] = [
      new BB(-TILE_WIDTH, 0, 0, H),
      new BB(0, -TILE_HEIGHT, W, 0),
      new BB(W, 0, W + TILE_WIDTH, H),
      new BB(0, H, W, H + TILE_HEIGHT),
    ];
    const tx0 = Math.floor((cx - rx) / TILE_WIDTH) - 1;
    const ty0 = Math.floor((cy - ry) / TILE_HEIGHT) - 1;
    const tx1 = Math.ceil((cx + rx) / TILE_WIDTH) + 1;
    const ty1 = Math.ceil((cy + ry) / TILE_HEIGHT) + 1;
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const tile = this.getTile(tx, ty);
        if (!tile || !tile.passable) {
          const topInset = !tile || tile.type === TileType.Wall || tile.type === TileType.BreakableWall ? WALL_CLIP_RISE : 0;
          result.push(new BB(
            tx * TILE_WIDTH, ty * TILE_HEIGHT - topInset,
            (tx + 1) * TILE_WIDTH, (ty + 1) * TILE_HEIGHT,
          ));
        }
      }
    }
    return result;
  }

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
      if (!tile || !tile.passable) return false;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; tx0 += sx; }
      if (e2 < dx) { err += dx; ty0 += sy; }
    }
    return true;
  }

  addSpawnPoint(x: number, y: number): void {
    this.spawnPoints.push({ x, y });
  }

  getRandomSpawnPoint(): SpawnPoint | null {
    if (this.spawnPoints.length === 0) return null;
    return this.spawnPoints[Math.floor(Math.random() * this.spawnPoints.length)];
  }
}
