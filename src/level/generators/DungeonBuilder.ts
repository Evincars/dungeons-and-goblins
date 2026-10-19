/** Generic procedural dungeon builder.
 *
 * Layout (left → right):
 *   [safe room] | [dungeon area – BSP rooms] | [exit room]
 *
 * Returns a DungeonLayout that callers use to populate the Level grid and
 * create ECS entities.  No direct world.add() calls happen here so this
 * class is fully reusable and testable in isolation.
 */

import { Level } from '../Level';
import { TileType, TILE_WIDTH, TILE_HEIGHT, createTile } from '../TileType';
import type { DungeonConfig } from './DungeonConfig';
import { bspSplit, leafToRoom, type Rect } from './BSPSplit';

// ── Public types ──────────────────────────────────────────────────────────────

export type RoomType = 'safe' | 'dungeon' | 'exit';

export type RoomData = {
  id: number;
  type: RoomType;
  /** Tile-space bounds (exclusive right/bottom). */
  x: number; y: number; w: number; h: number;
  /** Center in WORLD space (pixels). */
  centerX: number; centerY: number;
};

export type DoorData = {
  tiles: Array<{ x: number; y: number }>;
  /** Players past this world-X have left the safe room, so the door seals. */
  boundaryX: number;
};

export type DungeonLayout = {
  level: Level;
  rooms: RoomData[];
  playerSpawn: { x: number; y: number };
  torchPositions: Array<{ x: number; y: number }>;
  exitButtonPos: { x: number; y: number };
  shopPos: { x: number; y: number };
  safeDoor: DoorData;
};

// ── Builder ───────────────────────────────────────────────────────────────────

export class DungeonBuilder {
  private cfg: DungeonConfig;
  private rng: () => number;
  private roomIdSeq = 0;

  constructor(cfg: DungeonConfig) {
    this.cfg = cfg;
    let seed = (cfg.seed ?? Date.now()) >>> 0;
    this.rng = () => {
      seed = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b);
      seed = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b);
      seed ^= seed >>> 16;
      return (seed >>> 0) / 0x100000000;
    };
  }

  build(): DungeonLayout {
    const { cfg } = this;
    const level = new Level(cfg.mapWidth, cfg.mapHeight);

    // Fill everything with walls initially
    this.fill(level, 0, 0, cfg.mapWidth, cfg.mapHeight, TileType.Wall);

    // ── Safe room (left) ──────────────────────────────────────────────────────
    const safeInner = this.carveRoom(level, 1, 1, cfg.safeRoomW - 2, cfg.mapHeight - 2, 'safe');

    // Mark safe zone tiles
    for (let ty = safeInner.y; ty < safeInner.y + safeInner.h; ty++) {
      for (let tx = safeInner.x; tx < safeInner.x + safeInner.w; tx++) {
        level.markSafeZone(tx, ty);
      }
    }

    // ── Exit room (right) ─────────────────────────────────────────────────────
    const exitX = cfg.mapWidth - cfg.exitRoomW;
    const exitInner = this.carveRoom(level, exitX + 1, 1, cfg.exitRoomW - 2, cfg.mapHeight - 2, 'exit');
    for (let ty = exitInner.y; ty < exitInner.y + exitInner.h; ty++) {
      for (let tx = exitInner.x; tx < exitInner.x + exitInner.w; tx++) {
        level.markSafeZone(tx, ty);
      }
    }

    // ── Dungeon middle area (BSP) ─────────────────────────────────────────────
    const dungeonX = cfg.safeRoomW;
    const dungeonW = cfg.mapWidth - cfg.safeRoomW - cfg.exitRoomW;
    const area: Rect = { x: dungeonX, y: 1, w: dungeonW, h: cfg.mapHeight - 2 };
    const leaves = bspSplit(area, cfg.minRoomSize + 2, cfg.splitDepth, this.rng);

    const dungeonRooms: RoomData[] = [];
    for (const leaf of leaves) {
      const r = leafToRoom(leaf, 1, cfg.minRoomSize);
      if (!r) continue;
      // Optionally shrink to maxRoomSize
      const rx = r.x + Math.floor(this.rng() * Math.max(0, r.w - cfg.maxRoomSize));
      const ry = r.y + Math.floor(this.rng() * Math.max(0, r.h - cfg.maxRoomSize));
      const rw = Math.min(r.w, cfg.minRoomSize + Math.floor(this.rng() * (cfg.maxRoomSize - cfg.minRoomSize + 1)));
      const rh = Math.min(r.h, cfg.minRoomSize + Math.floor(this.rng() * (cfg.maxRoomSize - cfg.minRoomSize + 1)));
      dungeonRooms.push(this.carveRoom(level, rx, ry, rw, rh, 'dungeon'));
    }

    // Connect dungeon rooms with corridors
    this.connectRoomsSequentially(level, [safeInner, ...dungeonRooms, exitInner]);

    // ── Safe-room door ──────────────────────────────────────────────────────
    // A one-tile gate in the wall column between the safe room and the dungeon,
    // aligned with the corridor so it is open on spawn and seals once players leave.
    const doorCol = cfg.safeRoomW - 1;
    const doorMidY = safeInner.y + Math.floor(safeInner.h / 2);
    const doorHalf = Math.floor(cfg.corridorW / 2);
    const doorTiles: Array<{ x: number; y: number }> = [];
    for (let ty = doorMidY - doorHalf; ty <= doorMidY + doorHalf; ty++) {
      level.setTile(doorCol, ty, createTile(TileType.Floor, 0));
      doorTiles.push({ x: doorCol, y: ty });
    }
    const safeDoor = {
      tiles: doorTiles,
      boundaryX: cfg.safeRoomW * TILE_WIDTH,
    };

    // ── Torches ───────────────────────────────────────────────────────────────
    const torchPositions: Array<{ x: number; y: number }> = [];
    const allRooms = [safeInner, ...dungeonRooms, exitInner];
    for (const room of allRooms) {
      this.placeTorchesInRoom(room, torchPositions);
    }

    // ── Spawn points ──────────────────────────────────────────────────────────
    const playerSpawn = {
      x: (safeInner.x + 2) * TILE_WIDTH + TILE_WIDTH / 2,
      y: (safeInner.y + Math.floor(safeInner.h / 2)) * TILE_HEIGHT + TILE_HEIGHT / 2,
    };
    level.addSpawnPoint(playerSpawn.x, playerSpawn.y);

    const shopPos = {
      x: (safeInner.x + safeInner.w - 3) * TILE_WIDTH + TILE_WIDTH / 2,
      y: (safeInner.y + Math.floor(safeInner.h / 2)) * TILE_HEIGHT + TILE_HEIGHT / 2,
    };

    const exitButtonPos = {
      x: (exitInner.x + Math.floor(exitInner.w / 2)) * TILE_WIDTH + TILE_WIDTH / 2,
      y: (exitInner.y + Math.floor(exitInner.h / 2)) * TILE_HEIGHT + TILE_HEIGHT / 2,
    };

    return {
      level,
      rooms: allRooms,
      playerSpawn,
      torchPositions,
      exitButtonPos,
      shopPos,
      safeDoor,
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private nextId(): number { return this.roomIdSeq++; }

  private fill(level: Level, x: number, y: number, w: number, h: number, type: TileType): void {
    for (let ty = y; ty < y + h; ty++) {
      for (let tx = x; tx < x + w; tx++) {
        level.setTile(tx, ty, createTile(type, Math.floor(this.rng() * 4)));
      }
    }
  }

  private carveRoom(level: Level, x: number, y: number, w: number, h: number, type: RoomType): RoomData {
    this.fill(level, x, y, w, h, TileType.Floor);
    const id = this.nextId();
    return {
      id, type, x, y, w, h,
      centerX: (x + Math.floor(w / 2)) * TILE_WIDTH + TILE_WIDTH / 2,
      centerY: (y + Math.floor(h / 2)) * TILE_HEIGHT + TILE_HEIGHT / 2,
    };
  }

  private connectRoomsSequentially(level: Level, rooms: RoomData[]): void {
    for (let i = 0; i < rooms.length - 1; i++) {
      this.connectTwoRooms(level, rooms[i], rooms[i + 1]);
    }
  }

  private connectTwoRooms(level: Level, a: RoomData, b: RoomData): void {
    const cw = this.cfg.corridorW;
    // Center-point of each room in tile coords
    const ax = a.x + Math.floor(a.w / 2);
    const ay = a.y + Math.floor(a.h / 2);
    const bx = b.x + Math.floor(b.w / 2);
    const by = b.y + Math.floor(b.h / 2);

    // L-shaped corridor: horizontal first, then vertical
    const hx0 = Math.min(ax, bx);
    const hx1 = Math.max(ax, bx);
    const offY = Math.floor(-cw / 2);
    this.fill(level, hx0, ay + offY, hx1 - hx0 + 1, cw, TileType.Floor);

    const vy0 = Math.min(ay, by);
    const vy1 = Math.max(ay, by);
    const offX = Math.floor(-cw / 2);
    this.fill(level, bx + offX, vy0, cw, vy1 - vy0 + 1, TileType.Floor);
  }

  private placeTorchesInRoom(room: RoomData, out: Array<{ x: number; y: number }>): void {
    const { torchSpacing } = this.cfg;
    // Place torches on the inner perimeter of the room every torchSpacing tiles
    const perim: [number, number][] = [];
    for (let tx = room.x; tx < room.x + room.w; tx++) {
      perim.push([tx, room.y]);
      perim.push([tx, room.y + room.h - 1]);
    }
    for (let ty = room.y + 1; ty < room.y + room.h - 1; ty++) {
      perim.push([room.x, ty]);
      perim.push([room.x + room.w - 1, ty]);
    }
    // Sample every torchSpacing perim tiles (offset randomly per room)
    const offset = Math.floor(this.rng() * torchSpacing);
    for (let i = offset; i < perim.length; i += torchSpacing) {
      const [tx, ty] = perim[i];
      out.push({
        x: tx * TILE_WIDTH + TILE_WIDTH / 2,
        y: ty * TILE_HEIGHT + TILE_HEIGHT / 2,
      });
    }
  }
}
