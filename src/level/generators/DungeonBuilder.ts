/** Generic procedural dungeon builder.
 *
 * Layout (left → right):
 *   [safe room] ─door─ [dungeon: BSP rooms joined along the tree] ── [exit room]
 *
 * Everything outside rooms and corridors stays solid wall, which the terrain
 * autotiler renders as black void with stone outlines and south-facing brick.
 * No world.add() calls happen here, so the builder is reusable and testable.
 */

import { Level } from '../Level';
import { TileType, TILE_WIDTH, TILE_HEIGHT, createTile } from '../TileType';
import type { DungeonConfig } from './DungeonConfig';
import { bspTree, bspLeaves, type BspNode } from './BSPSplit';
import { isPillarColumn } from '../TerrainAutotile';
import { COFFINS, CRATES, HANGINGS, POSTS, SARCOPHAGI, URNS } from '../Props';
import type { PropKind, PropPlacement } from '../Props';

type TileChange = { x: number; y: number; prev: TileType };
type Keep = (apply: () => TileChange[]) => boolean;

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
  /** World positions of torch flames (mounted on brick faces). */
  torchPositions: Array<{ x: number; y: number }>;
  /** Decorative and obstacle props (coffins, crates, urns, candles, wall hangings). */
  props: PropPlacement[];
  exitButtonPos: { x: number; y: number };
  shopPos: { x: number; y: number };
  safeDoor: DoorData;
};

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const tileCenter = (tx: number, ty: number) => ({
  x: tx * TILE_WIDTH + TILE_WIDTH / 2,
  y: ty * TILE_HEIGHT + TILE_HEIGHT / 2,
});

// ── Builder ───────────────────────────────────────────────────────────────────

export class DungeonBuilder {
  private readonly cfg: DungeonConfig;
  private readonly baseSeed: number;
  private rng: () => number = Math.random;
  private level!: Level;
  private roomIdSeq = 0;
  /** Tiles already taken by a prop or pit ring, so features don't overlap. */
  private readonly usedTiles = new Set<number>();

  constructor(cfg: DungeonConfig) {
    this.cfg = cfg;
    this.baseSeed = (cfg.seed ?? Date.now()) >>> 0;
  }

  build(): DungeonLayout {
    for (let attempt = 0; attempt < 25; attempt++) {
      const layout = this.buildOnce(this.baseSeed + attempt * 7919);
      if (layout) return layout;
    }
    throw new Error('Dungeon generation failed after 25 attempts');
  }

  private buildOnce(seed: number): DungeonLayout | null {
    const { cfg } = this;
    const W = cfg.mapWidth;
    const H = cfg.mapHeight;
    const cw = cfg.corridorW;
    this.rng = mulberry32(seed);
    this.roomIdSeq = 0;
    this.level = new Level(W, H);
    this.fill(0, 0, W, H, TileType.Wall);

    // ── Safe room (left) and exit room (right), vertically centred ────────────
    const sideW = cfg.safeRoomW - 6;
    const sideH = Math.min(10, H - 8);
    const safe = this.carveRoom(2, Math.floor((H - sideH) / 2), sideW, sideH, 'safe');
    const exitW = cfg.exitRoomW - 6;
    const exit = this.carveRoom(W - 2 - exitW, Math.floor((H - sideH) / 2), exitW, sideH, 'exit');

    // ── Dungeon rooms, one per BSP leaf ───────────────────────────────────────
    const area = { x: cfg.safeRoomW, y: 1, w: W - cfg.safeRoomW - cfg.exitRoomW, h: H - 2 };
    const tree = bspTree(area, cfg.minRoomSize + 3, cfg.splitDepth, this.rng);
    const leafRooms = new Map<BspNode, RoomData>();
    for (const leaf of bspLeaves(tree)) {
      const r = leaf.rect;
      // 1-tile margin left/right/bottom, 2 on top so north walls are thick
      // enough for a full brick face.
      const maxW = Math.min(cfg.maxRoomSize, r.w - 2);
      const maxH = Math.min(cfg.maxRoomSize, r.h - 3);
      if (maxW < cfg.minRoomSize || maxH < cfg.minRoomSize) continue;
      const w = this.randInt(cfg.minRoomSize, maxW);
      const h = this.randInt(cfg.minRoomSize, maxH);
      const x = r.x + 1 + this.randInt(0, r.w - 2 - w);
      const y = r.y + 2 + this.randInt(0, r.h - 3 - h);
      leafRooms.set(leaf, this.carveRoom(x, y, w, h, 'dungeon'));
    }
    const dungeonRooms = [...leafRooms.values()];
    if (dungeonRooms.length < 4) return null;

    // ── Join siblings up the BSP tree, so corridors follow the partitioning ───
    const join = (node: BspNode): RoomData[] => {
      if (!node.left || !node.right) {
        const room = leafRooms.get(node);
        return room ? [room] : [];
      }
      const a = join(node.left);
      const b = join(node.right);
      if (a.length && b.length) {
        let best: [RoomData, RoomData] = [a[0], b[0]];
        let bestGap = Infinity;
        for (const ra of a) for (const rb of b) {
          const gap = this.rectGap(ra, rb);
          if (gap < bestGap) { bestGap = gap; best = [ra, rb]; }
        }
        this.corridor(best[0], best[1]);
      }
      return [...a, ...b];
    };
    join(tree);

    // ── Safe door → nearest dungeon room; nearest dungeon room → exit ─────────
    const doorX = safe.x + safe.w;
    const doorY = safe.y + Math.floor((safe.h - cw) / 2);
    const firstRoom = this.nearestRoom(dungeonRooms, doorX, doorY + cw / 2);
    this.corridorFromPoint(doorX, doorY, firstRoom, 1);
    const exitDoorX = exit.x - 1;
    const exitDoorY = exit.y + Math.floor((exit.h - cw) / 2);
    const lastRoom = this.nearestRoom(dungeonRooms, exitDoorX, exitDoorY + cw / 2);
    this.corridorFromPoint(exitDoorX, exitDoorY, lastRoom, -1);

    const doorTiles: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < cw; i++) doorTiles.push({ x: doorX, y: doorY + i });

    this.removeSlivers();

    const playerTile = { x: safe.x + 2, y: safe.y + Math.floor(safe.h / 2) };
    const exitTile = { x: exit.x + Math.floor(exit.w / 2), y: exit.y + Math.floor(exit.h / 2) };
    const anchors = () => [exitTile, ...dungeonRooms.map((r) => this.anyFloor(r))
      .filter((p): p is { x: number; y: number } => p !== null)];
    if (!this.reachable(playerTile, anchors())) return null;

    // ── Room features, each kept only if everything stays reachable ───────────
    const props: PropPlacement[] = [];
    this.usedTiles.clear();
    const keepIfReachable = (apply: () => TileChange[]) => this.tryFeature(playerTile, anchors, apply);
    for (const room of dungeonRooms) {
      let structured = false;
      if (room.w >= 9 && room.h >= 8 && this.rng() < cfg.pillarChance) {
        structured = keepIfReachable(() => this.pillarBlocks(room));
      } else if (room.w >= 6 && room.h >= 6 && this.rng() < cfg.pitChance) {
        structured = this.pits(room, keepIfReachable);
      }
      this.furnish(room, structured, props, keepIfReachable);
    }

    // ── Safe zones ────────────────────────────────────────────────────────────
    for (const room of [safe, exit]) {
      for (let ty = room.y; ty < room.y + room.h; ty++) {
        for (let tx = room.x; tx < room.x + room.w; tx++) this.level.markSafeZone(tx, ty);
      }
    }

    const torchTiles = this.placeTorches();
    this.placeHangings(torchTiles, props);

    return {
      level: this.level,
      rooms: [safe, ...dungeonRooms, exit],
      playerSpawn: (() => {
        const p = tileCenter(playerTile.x, playerTile.y);
        this.level.addSpawnPoint(p.x, p.y);
        return p;
      })(),
      torchPositions: torchTiles.map((t) => ({ x: t.x * TILE_WIDTH + TILE_WIDTH / 2, y: t.y * TILE_HEIGHT - 30 })),
      props,
      exitButtonPos: tileCenter(exitTile.x, exitTile.y),
      shopPos: tileCenter(safe.x + Math.floor(safe.w / 2), safe.y + 1),
      safeDoor: { tiles: doorTiles, boundaryX: (doorX + 1) * TILE_WIDTH + TILE_WIDTH / 2 },
    };
  }

  // ── Carving ─────────────────────────────────────────────────────────────────

  private randInt(min: number, max: number): number {
    return min + Math.floor(this.rng() * (max - min + 1));
  }

  private isWall(tx: number, ty: number): boolean {
    const t = this.level.getTile(tx, ty);
    return !t || t.type === TileType.Wall || t.type === TileType.BreakableWall;
  }

  private fill(x: number, y: number, w: number, h: number, type: TileType): void {
    for (let ty = y; ty < y + h; ty++) {
      for (let tx = x; tx < x + w; tx++) {
        // Never carve the outermost ring, so the map always has a wall border.
        if (type !== TileType.Wall && (tx <= 0 || ty <= 0 || tx >= this.cfg.mapWidth - 1 || ty >= this.cfg.mapHeight - 1)) continue;
        this.level.setTile(tx, ty, createTile(type, Math.floor(this.rng() * 4)));
      }
    }
  }

  private carveRoom(x: number, y: number, w: number, h: number, type: RoomType): RoomData {
    this.fill(x, y, w, h, TileType.Floor);
    return {
      id: this.roomIdSeq++, type, x, y, w, h,
      centerX: (x + Math.floor(w / 2)) * TILE_WIDTH + TILE_WIDTH / 2,
      centerY: (y + Math.floor(h / 2)) * TILE_HEIGHT + TILE_HEIGHT / 2,
    };
  }

  private rectGap(a: RoomData, b: RoomData): number {
    const gx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
    const gy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
    return gx + gy;
  }

  private nearestRoom(rooms: RoomData[], tx: number, ty: number): RoomData {
    let best = rooms[0];
    let bestD = Infinity;
    for (const r of rooms) {
      const cx = Math.max(r.x, Math.min(tx, r.x + r.w - 1));
      const cy = Math.max(r.y, Math.min(ty, r.y + r.h - 1));
      const d = Math.abs(cx - tx) + Math.abs(cy - ty) * 1.5;
      if (d < bestD) { bestD = d; best = r; }
    }
    return best;
  }

  /** Straight corridor where the rooms overlap on an axis, otherwise an L. */
  private corridor(a: RoomData, b: RoomData): void {
    const cw = this.cfg.corridorW;
    const oy0 = Math.max(a.y, b.y);
    const oy1 = Math.min(a.y + a.h, b.y + b.h);
    if (oy1 - oy0 >= cw) {
      const y = this.randInt(oy0, oy1 - cw);
      const [l, r] = a.x < b.x ? [a, b] : [b, a];
      const x0 = l.x + l.w;
      this.fill(x0, y, Math.max(0, r.x - x0), cw, TileType.Floor);
      return;
    }
    const ox0 = Math.max(a.x, b.x);
    const ox1 = Math.min(a.x + a.w, b.x + b.w);
    if (ox1 - ox0 >= cw) {
      const x = this.randInt(ox0, ox1 - cw);
      const [t, btm] = a.y < b.y ? [a, b] : [b, a];
      const y0 = t.y + t.h;
      this.fill(x, y0, cw, Math.max(0, btm.y - y0), TileType.Floor);
      return;
    }
    const px = this.randInt(a.x, a.x + a.w - cw);
    const py = this.randInt(a.y, a.y + a.h - cw);
    const qx = this.randInt(b.x, b.x + b.w - cw);
    const qy = this.randInt(b.y, b.y + b.h - cw);
    if (this.rng() < 0.5) {
      this.fill(Math.min(px, qx), py, Math.abs(qx - px) + cw, cw, TileType.Floor);
      this.fill(qx, Math.min(py, qy), cw, Math.abs(qy - py) + cw, TileType.Floor);
    } else {
      this.fill(px, Math.min(py, qy), cw, Math.abs(qy - py) + cw, TileType.Floor);
      this.fill(Math.min(px, qx), qy, Math.abs(qx - px) + cw, cw, TileType.Floor);
    }
  }

  /** Corridor from a door column (heading `dir` = ±1 on x) into a room. */
  private corridorFromPoint(x: number, y: number, room: RoomData, dir: 1 | -1): void {
    const cw = this.cfg.corridorW;
    if (room.y <= y && room.y + room.h >= y + cw) {
      const end = dir > 0 ? room.x : room.x + room.w - 1;
      this.fill(Math.min(x, end), y, Math.abs(end - x) + 1, cw, TileType.Floor);
      return;
    }
    const cx = room.x + Math.floor((room.w - cw) / 2);
    const cy = room.y + Math.floor((room.h - cw) / 2);
    this.fill(Math.min(x, cx), y, Math.abs(cx - x) + cw, cw, TileType.Floor);
    this.fill(cx, Math.min(y, cy), cw, Math.abs(cy - y) + cw, TileType.Floor);
  }

  /** Turns 1-tile wall slivers (open on both sides vertically) and lone posts into floor. */
  private removeSlivers(): void {
    const { cfg } = this;
    const open = (tx: number, ty: number) => !this.isWall(tx, ty);
    for (let pass = 0; pass < 3; pass++) {
      let changed = false;
      for (let ty = 1; ty < cfg.mapHeight - 1; ty++) {
        for (let tx = cfg.safeRoomW; tx < cfg.mapWidth - cfg.exitRoomW; tx++) {
          if (!this.isWall(tx, ty)) continue;
          const ns = open(tx, ty - 1) && open(tx, ty + 1);
          const lone = ns && open(tx - 1, ty) && open(tx + 1, ty);
          if (ns || lone) {
            this.level.setTile(tx, ty, createTile(TileType.Floor, Math.floor(this.rng() * 4)));
            changed = true;
          }
        }
      }
      if (!changed) break;
    }
  }

  // ── Room features ───────────────────────────────────────────────────────────

  /** Sets tiles and returns what they were, so a feature can be undone. */
  private setTiles(cells: Array<[number, number]>, type: TileType): TileChange[] {
    return cells.map(([x, y]) => {
      const change = { x, y, prev: this.level.getTile(x, y)!.type };
      this.level.setTile(x, y, createTile(type, 0));
      return change;
    });
  }

  private isFloor(tx: number, ty: number): boolean {
    return this.level.getTile(tx, ty)?.type === TileType.Floor;
  }

  private free(tx: number, ty: number): boolean {
    return this.isFloor(tx, ty) && !this.usedTiles.has(tx + ty * this.cfg.mapWidth);
  }

  private claim(tx: number, ty: number): void {
    this.usedTiles.add(tx + ty * this.cfg.mapWidth);
  }

  private pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.rng() * list.length)];
  }

  /** Two (or four) solid 2×3 wall blocks, mirrored across the room. */
  private pillarBlocks(room: RoomData): TileChange[] {
    const bw = 2, bh = 3;
    const xs = [room.x + 2, room.x + room.w - 2 - bw];
    const ys = room.h >= 12 ? [room.y + 2, room.y + room.h - 2 - bh] : [room.y + Math.floor((room.h - bh) / 2)];
    if (xs[1] - xs[0] < bw + 2) return [];
    const cells: Array<[number, number]> = [];
    for (const by of ys) for (const bx of xs) {
      for (let ty = by; ty < by + bh; ty++) for (let tx = bx; tx < bx + bw; tx++) cells.push([tx, ty]);
    }
    return this.setTiles(cells, TileType.Wall);
  }

  /** One or two framed 2×2 pits, each with a ring of floor around it and 2 tiles clear of the walls. */
  private pits(room: RoomData, keep: Keep): boolean {
    let placed = false;
    const count = room.w >= 10 && this.rng() < 0.5 ? 2 : 1;
    const maxX = room.x + room.w - 4;
    const maxY = room.y + room.h - 4;
    for (let i = 0; i < count && maxX >= room.x + 2 && maxY >= room.y + 2; i++) {
      for (let attempt = 0; attempt < 6; attempt++) {
        const px = this.randInt(room.x + 2, maxX);
        const py = this.randInt(room.y + 2, maxY);
        let ringClear = true;
        for (let y = py - 1; y <= py + 2; y++) for (let x = px - 1; x <= px + 2; x++) if (!this.free(x, y)) ringClear = false;
        if (!ringClear) continue;
        if (keep(() => this.setTiles([[px, py], [px + 1, py], [px, py + 1], [px + 1, py + 1]], TileType.Hole))) {
          this.level.pits.push({ x: px, y: py });
          for (let y = py - 1; y <= py + 2; y++) for (let x = px - 1; x <= px + 2; x++) this.claim(x, y);
          placed = true;
          break;
        }
      }
    }
    return placed;
  }

  /** Blocks the given tiles with props, if the dungeon stays connected. */
  private placeSolid(cells: Array<[number, number]>, kinds: PropKind[], props: PropPlacement[], keep: Keep): boolean {
    if (cells.length === 0 || !cells.every(([x, y]) => this.free(x, y))) return false;
    if (!keep(() => this.setTiles(cells, TileType.Obstacle))) return false;
    cells.forEach(([x, y], i) => { this.claim(x, y); props.push({ kind: kinds[i % kinds.length], tx: x, ty: y }); });
    return true;
  }

  /** Dresses a dungeon room by theme: a crypt, a storeroom or a plain hall. */
  private furnish(room: RoomData, structured: boolean, props: PropPlacement[], keep: Keep): void {
    const roll = this.rng();
    if (roll < 0.4) {
      this.tombNiches(room, props, keep);
      if (!structured && room.w >= 8 && room.h >= 7) this.sarcophagi(room, props, keep);
    } else if (roll < 0.7) {
      this.crateCorners(room, props, keep);
    } else if (!structured && room.w >= 8 && room.h >= 8) {
      const y = room.y + Math.floor(room.h / 2);
      this.placeSolid([[room.x + 2, y]], [this.pick(POSTS)], props, keep);
      this.placeSolid([[room.x + room.w - 3, y]], [this.pick(POSTS)], props, keep);
    }
    this.urnsAlongWalls(room, roll >= 0.4 && roll < 0.7 ? 4 : 2, props);
  }

  /**
   * Skeleton niches in a room's north wall, each with a pair of coffins standing
   * in front of it and candles beside them.
   */
  private tombNiches(room: RoomData, props: PropPlacement[], keep: Keep): void {
    const ty = room.y;
    let placed = 0;
    for (let tx = room.x + 1; tx <= room.x + room.w - 3 && placed < 2; tx++) {
      const segment = [tx, tx + 1];
      const fullFace = segment.every((x) => this.isWall(x, ty - 1) && this.isWall(x, ty - 2) && !isPillarColumn(x));
      if (!fullFace || !this.isWall(tx - 1, ty - 1) || !this.isWall(tx + 2, ty - 1) || this.rng() < 0.35) continue;
      if (!this.placeSolid([[tx, ty], [tx + 1, ty]], [this.pick(COFFINS), this.pick(COFFINS)], props, keep)) continue;
      const W = this.cfg.mapWidth;
      this.level.wallDecor.set(tx + (ty - 1) * W, 'niche0');
      this.level.wallDecor.set(tx + 1 + (ty - 1) * W, 'niche1');
      for (const cx of [tx - 1, tx + 2]) {
        if (this.free(cx, ty) && this.rng() < 0.7) {
          this.claim(cx, ty);
          props.push({ kind: this.rng() < 0.5 ? 'candles' : 'candle', tx: cx, ty });
        }
      }
      placed++;
      tx += 3;
    }
  }

  /** A row of sarcophagi across the middle of the room, with gaps to walk between. */
  private sarcophagi(room: RoomData, props: PropPlacement[], keep: Keep): void {
    const ty = room.y + Math.floor(room.h / 2);
    const cells: Array<[number, number]> = [];
    for (let x = room.x + 2; x <= room.x + room.w - 3; x += 2) cells.push([x, ty]);
    if (cells.length >= 2) this.placeSolid(cells, cells.map(() => this.pick(SARCOPHAGI)), props, keep);
  }

  /** Stacks of crates in one or two corners. */
  private crateCorners(room: RoomData, props: PropPlacement[], keep: Keep): void {
    const corners: Array<[number, number, number]> = [
      [room.x, room.y, 1], [room.x + room.w - 1, room.y, -1],
      [room.x, room.y + room.h - 1, 1], [room.x + room.w - 1, room.y + room.h - 1, -1],
    ];
    const count = 1 + (this.rng() < 0.5 ? 1 : 0);
    for (let i = 0; i < count; i++) {
      const [x, y, dir] = corners.splice(Math.floor(this.rng() * corners.length), 1)[0];
      const cells: Array<[number, number]> = [[x, y], [x + dir, y]];
      this.placeSolid(cells, cells.map(() => this.pick(CRATES)), props, keep);
    }
  }

  /** Urns (non-blocking) standing against the walls. */
  private urnsAlongWalls(room: RoomData, count: number, props: PropPlacement[]): void {
    const spots: Array<[number, number]> = [];
    for (let ty = room.y; ty < room.y + room.h; ty++) {
      for (let tx = room.x; tx < room.x + room.w; tx++) {
        if (!this.free(tx, ty)) continue;
        if (this.isWall(tx - 1, ty) || this.isWall(tx + 1, ty) || this.isWall(tx, ty - 1)) spots.push([tx, ty]);
      }
    }
    for (let i = 0; i < count && spots.length; i++) {
      const [tx, ty] = spots.splice(Math.floor(this.rng() * spots.length), 1)[0];
      this.claim(tx, ty);
      props.push({ kind: this.pick(URNS), tx, ty });
    }
  }

  private tryFeature(
    from: { x: number; y: number },
    anchors: () => Array<{ x: number; y: number }>,
    apply: () => TileChange[],
  ): boolean {
    const changes = apply();
    if (changes.length === 0) return false;
    if (this.reachable(from, anchors())) return true;
    for (const c of changes) this.level.setTile(c.x, c.y, createTile(c.prev, 0));
    return false;
  }

  private anyFloor(room: RoomData): { x: number; y: number } | null {
    const cx = room.x + Math.floor(room.w / 2);
    const cy = room.y + Math.floor(room.h / 2);
    if (this.level.getTile(cx, cy)?.type === TileType.Floor) return { x: cx, y: cy };
    for (let ty = room.y; ty < room.y + room.h; ty++) {
      for (let tx = room.x; tx < room.x + room.w; tx++) {
        if (this.level.getTile(tx, ty)?.type === TileType.Floor) return { x: tx, y: ty };
      }
    }
    return null;
  }

  /** Flood-fills walkable floor (holes excluded) and checks every target is reached. */
  private reachable(from: { x: number; y: number }, targets: Array<{ x: number; y: number }>): boolean {
    const W = this.cfg.mapWidth;
    const H = this.cfg.mapHeight;
    const seen = new Uint8Array(W * H);
    const stack = [from.x + from.y * W];
    seen[stack[0]] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % W;
      const y = (i - x) / W;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = nx + ny * W;
        if (seen[j] || this.level.getTile(nx, ny)?.type !== TileType.Floor) continue;
        seen[j] = 1;
        stack.push(j);
      }
    }
    return targets.every((t) => seen[t.x + t.y * W] === 1);
  }

  // ── Torches ─────────────────────────────────────────────────────────────────

  /** A plain stretch of full-height brick face above floor tile (tx, ty), free for wall fixtures. */
  private mountable(tx: number, ty: number): boolean {
    const W = this.cfg.mapWidth;
    return this.isFloor(tx, ty)
      && this.isWall(tx, ty - 1) && this.isWall(tx, ty - 2)
      && this.isWall(tx - 1, ty - 1) && this.isWall(tx + 1, ty - 1)
      && !isPillarColumn(tx) && !this.level.wallDecor.has(tx + (ty - 1) * W);
  }

  /** Torches hang on full-height brick faces; returns the floor tiles below them. */
  private placeTorches(): Array<{ x: number; y: number }> {
    const { cfg } = this;
    const out: Array<{ x: number; y: number }> = [];
    for (let ty = 2; ty < cfg.mapHeight; ty++) {
      let last = -Infinity;
      for (let tx = 1; tx < cfg.mapWidth - 1; tx++) {
        if (!this.mountable(tx, ty) || tx - last < cfg.torchSpacing || this.rng() < 0.25) continue;
        last = tx;
        out.push({ x: tx, y: ty });
      }
    }
    return out;
  }

  /** Cauldrons and chains hung on faces between the torches. */
  private placeHangings(torches: Array<{ x: number; y: number }>, props: PropPlacement[]): void {
    const { cfg } = this;
    const nearTorch = (tx: number, ty: number) => torches.some((t) => t.y === ty && Math.abs(t.x - tx) < 2);
    for (let ty = 2; ty < cfg.mapHeight; ty++) {
      for (let tx = 1; tx < cfg.mapWidth - 1; tx++) {
        if (!this.mountable(tx, ty) || nearTorch(tx, ty) || this.level.isSafeZone(tx, ty) || this.rng() > 0.12) continue;
        props.push({ kind: this.pick(HANGINGS), tx, ty });
        tx += 2;
      }
    }
  }
}
