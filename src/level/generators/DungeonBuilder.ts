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
import { firstTile, forEachTile, someTile } from '../Grid';
import { tileGraphOf } from '../TileGraph';
import type { StepCost } from '../TileGraph';
import { reachableTiles } from '../TileSearch';
import { StateError } from '../../core/errors';
import type { DungeonConfig } from './DungeonConfig';
import { bspTree, bspLeaves, type BspNode } from './BSPSplit';
import { isPillarColumn } from '../TerrainAutotile';
import {
  CAVE_CENTREPIECES, CAVE_CRYSTALS, GEM_CRYSTALS, CAVE_PLANTS, CAVE_SPIRES, CAVE_STONES, COFFINS, CRATES, CRYPT_CENTREPIECES,
  HALL_CENTREPIECES, HANGINGS, PEDESTALS, POSTS, PROPS, SARCOPHAGI, STORE_CENTREPIECES, STORE_FURNITURE, STORE_GOODS, URNS,
  propBlockRect, propWeight,
} from '../Props';
import type { BlockRect, PropDef, PropKind, PropPlacement } from '../Props';
import { MathUtils } from 'yuka';

type TileChange = { x: number; y: number; prev: TileType };
type Keep = (apply: () => TileChange[]) => boolean;
type TilePos = { x: number; y: number };

/** Layouts that come out unusable (too few rooms, cut-off areas) are rerolled up to this many times. */
const MAX_ATTEMPTS = 25;
/** Seed step between attempts (a prime, so rerolls don't fall into a pattern). */
const ATTEMPT_SEED_STEP = 7919;
/** A dungeon with fewer rooms than this is rerolled. */
const MIN_DUNGEON_ROOMS = 4;
/** Floor tiles have this many image variants. */
const FLOOR_VARIANTS = 4;
/** The side rooms are at most this tall (tiles), and keep this much wall above and below. */
const SIDE_ROOM_MAX_H = 10;
const SIDE_ROOM_MARGIN = 8;
/** Width taken off the reserved side strip, so a wall band stays between the side room and the dungeon. */
const SIDE_ROOM_INSET = 6;
/** Moving across rooms is cheaper than moving up and down when choosing the room a door corridor leads to. */
const DOOR_VERTICAL_WEIGHT = 1.5;
/** Sliver removal repeats until nothing changes, but no more than this. */
const SLIVER_PASSES = 3;
/** Pillar blocks are this many tiles wide and tall. */
const PILLAR_W = 2;
const PILLAR_H = 3;
/** Rooms at least this tall get four pillar blocks instead of two. */
const FOUR_PILLAR_ROOM_H = 12;
/** Chance a wide room with a pit gets a second one. */
const SECOND_PIT_CHANCE = 0.2;
/** Tries to find a free spot for each pit. */
const PIT_ATTEMPTS = 6;
/** Chance a tomb niche spot is skipped, and that a candle stands beside a niche coffin. */
const NICHE_SKIP_CHANCE = 0.35;
const CANDLE_CHANCE = 0.7;
/** Chance a torch spot is left dark, and that a free face gets a wall hanging. */
const TORCH_SKIP_CHANCE = 0.25;
const HANGING_CHANCE = 0.12;
/** Chance a dungeon room keeps a storeroom corner: furniture backed against its north wall, goods in front. */
const STORE_CHANCE = 0.18;
/** A storeroom has up to this many pieces of furniture, and up to this many goods around each. */
const STORE_FURNITURE_MAX = 2;
const STORE_GOODS_MAX = 3;
/** Chance a plain hall is flanked by a pair of pedestals instead of posts. */
const PEDESTAL_CHANCE = 0.4;
/** Chance a room (or cave hall, three times as likely) holds one of the big glowing crystals: a rare find. */
const GEM_CRYSTAL_CHANCE = 0.04;
const HALL_CRYSTAL_FACTOR = 3;
/** Chance a room gets something standing in its middle (a tomb, a crate stack, a pedestal). */
const CENTREPIECE_CHANCE = 0.7;
/** Tiles of open floor a centrepiece keeps around it, and how far from the middle it may move to find them. */
const CENTRE_CLEARANCE = 1;
const CENTRE_SEARCH = 3;
/** Cave halls: how many spires, crystal clusters, stones and plants are strewn about (min, max). */
const CAVE_SPIRE_COUNT = [2, 4] as const;
const CAVE_CRYSTAL_COUNT = [3, 6] as const;
const CAVE_STONE_COUNT = [6, 12] as const;
const CAVE_PLANT_COUNT = [5, 10] as const;
/** The plant colours a cave hall can grow (one per hall, so it reads as one cave). */
const PLANT_COLOURS = ['yellow', 'red', 'lilac', 'teal'] as const;
/** Exit room: campfires this many tiles either side of the exit, banners every other tile of its north wall. */
const CAMPFIRE_SPREAD = 3;
const EXIT_BANNERS: readonly PropKind[] = ['banner_red', 'banner_blue', 'pennant_red', 'pennant_blue'];
/** Casks, crates and heaps stood in the corners of the safe and exit rooms. */
const GATHERING_CORNERS: readonly PropKind[] = [
  'barrel', 'barrel2', 'supplies_barrel', 'supplies_crates', 'supplies_crate', 'supplies_heap', 'crate_stack', 'crate_stack2',
];
/** A campfire's art fills the middle of its tile; only its ring of stones blocks. */
const CAMPFIRE_BLOCK: BlockRect = { x0: 3, y0: 14, x1: 29, y1: 24 };
/** Urns and pots, and sacks and bowls, stood along the walls of the safe and exit rooms. */
const GATHERING_URNS = 4;
const GATHERING_GOODS = 5;
/** Torch flames hang this far above the foot of their wall. */
const TORCH_FLAME_LIFT = 30;
/** Rows above which walls are too thin for wall fixtures. */
const FIXTURE_MIN_ROW = 2;

// ── Public types ──────────────────────────────────────────────────────────────

export type RoomType = 'safe' | 'dungeon' | 'exit';

export type RoomData = {
  id: number;
  type: RoomType;
  /** A big dungeon room furnished as a cave: cave ground, rock spires, crystals and plants. */
  hall?: boolean;
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
  /** World positions of the campfires in the exit room (each on a blocked tile). */
  campfires: Array<{ x: number; y: number }>;
  exitButtonPos: { x: number; y: number };
  shopPos: { x: number; y: number };
  /** Where the training dummy stands in the safe room. */
  dummyPos: { x: number; y: number };
  safeDoor: DoorData;
  /** Where the lever stands that opens the safe room's door. */
  leverPos: { x: number; y: number };
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
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const layout = this.buildOnce(this.baseSeed + attempt * ATTEMPT_SEED_STEP);
      if (layout) return layout;
    }
    throw new StateError('Dungeon generation failed', { seed: this.baseSeed, attempts: MAX_ATTEMPTS });
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
    const sideW = cfg.safeRoomW - SIDE_ROOM_INSET;
    const sideH = Math.min(SIDE_ROOM_MAX_H, H - SIDE_ROOM_MARGIN);
    const safe = this.carveRoom(2, Math.floor((H - sideH) / 2), sideW, sideH, 'safe');
    const exitW = cfg.exitRoomW - SIDE_ROOM_INSET;
    const exit = this.carveRoom(W - 2 - exitW, Math.floor((H - sideH) / 2), exitW, sideH, 'exit');

    // ── Dungeon rooms, one per BSP leaf ───────────────────────────────────────
    const area = { x: cfg.safeRoomW, y: 1, w: W - cfg.safeRoomW - cfg.exitRoomW, h: H - 2 };
    const tree = bspTree(area, cfg.minRoomSize + 3, cfg.splitDepth, this.rng, cfg.hallChance);
    const leafRooms = new Map<BspNode, RoomData>();
    for (const leaf of bspLeaves(tree)) {
      const room = this.leafRoom(leaf);
      if (room) leafRooms.set(leaf, room);
    }
    const dungeonRooms = [...leafRooms.values()];
    if (dungeonRooms.length < MIN_DUNGEON_ROOMS) return null;

    // ── Join siblings up the BSP tree, so corridors follow the partitioning ───
    this.joinTree(tree, leafRooms);

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
    // The lever that opens the door stands just inside the safe room, beside the doorway (above it when there is room).
    const leverTile = { x: doorX - 1, y: doorY - 1 >= safe.y ? doorY - 1 : doorY + cw };

    this.removeSlivers();

    const playerTile = { x: safe.x + 2, y: safe.y + Math.floor(safe.h / 2) };
    const exitTile = { x: exit.x + Math.floor(exit.w / 2), y: exit.y + Math.floor(exit.h / 2) };
    const anchors = () => [exitTile, ...dungeonRooms.map((r) => this.anyFloor(r))
      .filter((p): p is TilePos => p !== null)];
    if (!this.reachable(playerTile, anchors())) return null;

    // ── Room features, each kept only if everything stays reachable ───────────
    const props: PropPlacement[] = [];
    this.usedTiles.clear();
    const keepIfReachable = (apply: () => TileChange[]) => this.tryFeature(playerTile, anchors, apply);
    for (const room of dungeonRooms) {
      let structured = false;
      if (room.hall) {
        this.furnishCave(room, props, keepIfReachable);
        continue;
      }
      if (room.w >= 9 && room.h >= 8 && this.rng() < cfg.pillarChance) {
        structured = keepIfReachable(() => this.pillarBlocks(room));
      } else if (room.w >= 6 && room.h >= 6 && this.rng() < cfg.pitChance) {
        structured = this.pits(room, keepIfReachable);
      }
      this.furnish(room, structured, props, keepIfReachable);
    }

    // ── Safe zones ────────────────────────────────────────────────────────────
    for (const room of [safe, exit]) {
      forEachTile(room.x, room.y, room.x + room.w - 1, room.y + room.h - 1, (tx, ty) => this.level.markSafeZone(tx, ty));
    }

    const torchTiles = this.placeTorches();
    this.placeHangings(torchTiles, props);
    const shopTile = { x: safe.x + Math.floor(safe.w / 2), y: safe.y + 1 };
    const dummyTile = { x: safe.x + 2, y: safe.y + safe.h - 3 };
    this.usedTiles.add(dummyTile.x + dummyTile.y * W);
    // The exit, the spawn and the shop keeper's spot (and the wall behind and floor in front of it) stay clear.
    for (const t of [exitTile, playerTile, shopTile, leverTile, { x: shopTile.x, y: safe.y }, { x: shopTile.x, y: shopTile.y + 1 }]) {
      this.usedTiles.add(t.x + t.y * W);
    }
    const safeFire = { x: shopTile.x, y: safe.y + Math.floor(safe.h / 2) + 1 };
    const exitFires = [exitTile.x - CAMPFIRE_SPREAD, exitTile.x + CAMPFIRE_SPREAD].map((x) => ({ x, y: exitTile.y }));
    const campfires = [
      ...this.dressGatheringRoom(safe, [safeFire], torchTiles, props, keepIfReachable),
      ...this.dressGatheringRoom(exit, exitFires, torchTiles, props, keepIfReachable),
    ];

    const playerSpawn = tileCenter(playerTile.x, playerTile.y);
    this.level.addSpawnPoint(playerSpawn.x, playerSpawn.y);
    return {
      level: this.level,
      rooms: [safe, ...dungeonRooms, exit],
      playerSpawn,
      torchPositions: torchTiles.map((t) => ({ x: t.x * TILE_WIDTH + TILE_WIDTH / 2, y: t.y * TILE_HEIGHT - TORCH_FLAME_LIFT })),
      props,
      campfires: campfires.map((t) => tileCenter(t.x, t.y)),
      exitButtonPos: tileCenter(exitTile.x, exitTile.y),
      shopPos: tileCenter(shopTile.x, shopTile.y),
      dummyPos: tileCenter(dummyTile.x, dummyTile.y),
      safeDoor: { tiles: doorTiles, boundaryX: (doorX + 1) * TILE_WIDTH + TILE_WIDTH / 2 },
      leverPos: tileCenter(leverTile.x, leverTile.y),
    };
  }

  // ── Carving ─────────────────────────────────────────────────────────────────

  /**
   * The room a BSP partition holds: a hall in a partition left whole (if it is big enough), else a room of
   * the usual size. Rooms keep a 1-tile margin left, right and below, and 2 above so north walls are thick
   * enough for a full brick face.
   */
  private leafRoom(leaf: BspNode): RoomData | null {
    const { cfg } = this;
    const r = leaf.rect;
    const hall = !!leaf.merged && r.w - 2 >= cfg.hallMinSize && r.h - 3 >= cfg.hallMinSize;
    const minSize = hall ? cfg.hallMinSize : cfg.minRoomSize;
    const maxSize = hall ? cfg.hallMaxSize : cfg.maxRoomSize;
    const maxW = Math.min(maxSize, r.w - 2);
    const maxH = Math.min(maxSize, r.h - 3);
    if (maxW < cfg.minRoomSize || maxH < cfg.minRoomSize) return null;
    const w = this.randInt(Math.min(minSize, maxW), maxW);
    const h = this.randInt(Math.min(minSize, maxH), maxH);
    const x = r.x + 1 + this.randInt(0, r.w - 2 - w);
    const y = r.y + 2 + this.randInt(0, r.h - 3 - h);
    const room = this.carveRoom(x, y, w, h, 'dungeon');
    if (!hall) return room;
    room.hall = true;
    forEachTile(x, y, x + w - 1, y + h - 1, (tx, ty) => this.level.caveFloor.add(tx + ty * this.cfg.mapWidth));
    return room;
  }

  private randInt(min: number, max: number): number {
    return min + Math.floor(this.rng() * (max - min + 1));
  }

  private isWall(tx: number, ty: number): boolean {
    const t = this.level.getTile(tx, ty);
    return !t || t.type === TileType.Wall || t.type === TileType.BreakableWall;
  }

  private fill(x: number, y: number, w: number, h: number, type: TileType): void {
    forEachTile(x, y, x + w - 1, y + h - 1, (tx, ty) => this.fillTile(tx, ty, type));
  }

  private fillTile(tx: number, ty: number, type: TileType): void {
    // Never carve the outermost ring, so the map always has a wall border.
    const border = tx <= 0 || ty <= 0 || tx >= this.cfg.mapWidth - 1 || ty >= this.cfg.mapHeight - 1;
    if (type !== TileType.Wall && border) return;
    this.level.setTile(tx, ty, createTile(type, this.floorVariant()));
  }

  private floorVariant(): number {
    return Math.floor(this.rng() * FLOOR_VARIANTS);
  }

  /** Joins the rooms under each BSP node to their sibling's with one corridor; returns the rooms under `node`. */
  private joinTree(node: BspNode, leafRooms: Map<BspNode, RoomData>): RoomData[] {
    if (!node.left || !node.right) {
      const room = leafRooms.get(node);
      return room ? [room] : [];
    }
    const a = this.joinTree(node.left, leafRooms);
    const b = this.joinTree(node.right, leafRooms);
    if (a.length && b.length) {
      const [ra, rb] = this.closestPair(a, b);
      this.corridor(ra, rb);
    }
    return [...a, ...b];
  }

  /** The pair of rooms, one from each list, with the smallest gap between them (first found wins ties). */
  private closestPair(a: RoomData[], b: RoomData[]): [RoomData, RoomData] {
    let best: [RoomData, RoomData] = [a[0], b[0]];
    let bestGap = Infinity;
    for (const ra of a) {
      const [rb, gap] = this.nearestTo(ra, b);
      if (gap >= bestGap) continue;
      bestGap = gap;
      best = [ra, rb];
    }
    return best;
  }

  private nearestTo(room: RoomData, others: RoomData[]): [RoomData, number] {
    let best = others[0];
    let bestGap = Infinity;
    for (const other of others) {
      const gap = this.rectGap(room, other);
      if (gap >= bestGap) continue;
      bestGap = gap;
      best = other;
    }
    return [best, bestGap];
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
      const d = Math.abs(cx - tx) + Math.abs(cy - ty) * DOOR_VERTICAL_WEIGHT;
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
    for (let pass = 0; pass < SLIVER_PASSES; pass++) {
      if (!this.sliverPass()) break;
    }
  }

  /** One sweep of sliver removal over the dungeon area; returns whether any wall was opened. */
  private sliverPass(): boolean {
    const { cfg } = this;
    let changed = false;
    forEachTile(cfg.safeRoomW, 1, cfg.mapWidth - cfg.exitRoomW - 1, cfg.mapHeight - 2, (tx, ty) => {
      if (!this.isSliver(tx, ty)) return;
      this.level.setTile(tx, ty, createTile(TileType.Floor, this.floorVariant()));
      changed = true;
    });
    return changed;
  }

  /** A wall tile with open floor both north and south of it (a lone post is one of those too). */
  private isSliver(tx: number, ty: number): boolean {
    return this.isWall(tx, ty) && !this.isWall(tx, ty - 1) && !this.isWall(tx, ty + 1);
  }

  // ── Room features ───────────────────────────────────────────────────────────

  /** Sets tiles and returns what they were, so a feature can be undone. */
  private setTiles(cells: Array<[number, number]>, type: TileType): TileChange[] {
    return cells.map(([x, y]) => {
      const change = { x, y, prev: this.level.getTile(x, y)?.type ?? TileType.Wall };
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

  /** A prop from the list, the rare ones less often (by their weight). */
  private pickProp(kinds: readonly PropKind[]): PropKind {
    let roll = this.rng() * kinds.reduce((sum, kind) => sum + propWeight(kind), 0);
    for (const kind of kinds) {
      roll -= propWeight(kind);
      if (roll < 0) return kind;
    }
    return kinds[kinds.length - 1];
  }

  /** Two (or four) solid 2×3 wall blocks, mirrored across the room. */
  private pillarBlocks(room: RoomData): TileChange[] {
    const bw = PILLAR_W, bh = PILLAR_H;
    const xs = [room.x + 2, room.x + room.w - 2 - bw];
    const ys = room.h >= FOUR_PILLAR_ROOM_H ? [room.y + 2, room.y + room.h - 2 - bh] : [room.y + Math.floor((room.h - bh) / 2)];
    if (xs[1] - xs[0] < bw + 2) return [];
    const cells: Array<[number, number]> = [];
    for (const by of ys) {
      for (const bx of xs) forEachTile(bx, by, bx + bw - 1, by + bh - 1, (tx, ty) => cells.push([tx, ty]));
    }
    return this.setTiles(cells, TileType.Wall);
  }

  /** One or two framed 2×2 pits, each with a ring of floor around it and 2 tiles clear of the walls. */
  private pits(room: RoomData, keep: Keep): boolean {
    let placed = false;
    const count = room.w >= 10 && this.rng() < SECOND_PIT_CHANCE ? 2 : 1;
    const maxX = room.x + room.w - 4;
    const maxY = room.y + room.h - 4;
    for (let i = 0; i < count && maxX >= room.x + 2 && maxY >= room.y + 2; i++) {
      if (this.placePit(room, maxX, maxY, keep)) placed = true;
    }
    return placed;
  }

  /** Tries a few random spots for one pit; returns whether one was dug. */
  private placePit(room: RoomData, maxX: number, maxY: number, keep: Keep): boolean {
    for (let attempt = 0; attempt < PIT_ATTEMPTS; attempt++) {
      const px = this.randInt(room.x + 2, maxX);
      const py = this.randInt(room.y + 2, maxY);
      if (someTile(px - 1, py - 1, px + 2, py + 2, (x, y) => !this.free(x, y))) continue;
      if (!keep(() => this.setTiles([[px, py], [px + 1, py], [px, py + 1], [px + 1, py + 1]], TileType.Hole))) continue;
      this.level.pits.push({ x: px, y: py });
      forEachTile(px - 1, py - 1, px + 2, py + 2, (x, y) => this.claim(x, y));
      return true;
    }
    return false;
  }

  /** Blocks the given tiles with props, if the dungeon stays connected. */
  private placeSolid(cells: Array<[number, number]>, kinds: PropKind[], props: PropPlacement[], keep: Keep): boolean {
    if (cells.length === 0 || !cells.every(([x, y]) => this.free(x, y))) return false;
    if (!keep(() => this.setTiles(cells, TileType.Obstacle))) return false;
    cells.forEach(([x, y], i) => {
      const kind = kinds[i % kinds.length];
      this.claim(x, y);
      this.blockFoot(propBlockRect(PROPS[kind]), x, y, [[x, y]]);
      props.push({ kind, tx: x, ty: y });
    });
    return true;
  }

  /**
   * Records how much of each blocked tile a prop anchored at (tx, ty) really fills: `rect` (from the anchor
   * tile's corner) cut to each tile, so only the prop's foot stops characters.
   */
  private blockFoot(rect: BlockRect, tx: number, ty: number, cells: Array<[number, number]>): void {
    for (const [x, y] of cells) {
      const ox = (x - tx) * TILE_WIDTH;
      const oy = (y - ty) * TILE_HEIGHT;
      this.level.blockBoxes.set(x + y * this.cfg.mapWidth, {
        x0: MathUtils.clamp(rect.x0 - ox, 0, TILE_WIDTH), x1: MathUtils.clamp(rect.x1 - ox, 0, TILE_WIDTH),
        y0: MathUtils.clamp(rect.y0 - oy, 0, TILE_HEIGHT), y1: MathUtils.clamp(rect.y1 - oy, 0, TILE_HEIGHT),
      });
    }
  }

  /** Dresses a dungeon room by theme: a crypt, a storeroom or a plain hall. */
  private furnish(room: RoomData, structured: boolean, props: PropPlacement[], keep: Keep): void {
    const roll = this.rng();
    let centrepieces = HALL_CENTREPIECES;
    let middleTaken = false;
    if (roll < 0.4) {
      this.tombNiches(room, props, keep);
      middleTaken = !structured && room.w >= 8 && room.h >= 7 && this.sarcophagi(room, props, keep);
      centrepieces = CRYPT_CENTREPIECES;
    } else if (roll < 0.7) {
      this.crateCorners(room, props, keep);
      centrepieces = STORE_CENTREPIECES;
    } else if (!structured && room.w >= 8 && room.h >= 8) {
      this.flankingPair(room, props, keep);
    }
    if (!middleTaken && this.rng() < CENTREPIECE_CHANCE) this.centrepiece(room, centrepieces, props, keep);
    if (this.rng() < STORE_CHANCE) this.storeroom(room, props, keep);
    if (this.rng() < GEM_CRYSTAL_CHANCE) this.scatterSolid(room, this.shuffledFreeTiles(room), GEM_CRYSTALS, props, keep);
    this.urnsAlongWalls(room, roll >= 0.4 && roll < 0.7 ? 4 : 2, props, keep);
  }

  // ── Centrepieces and large props ────────────────────────────────────────────

  /** The tiles a prop blocks: its footprint, centred on (tx, ty) and reaching up from it. */
  private footprintCells(def: PropDef, tx: number, ty: number): Array<[number, number]> {
    const { w, h } = def.footprint ?? { w: 1, h: 1 };
    const cells: Array<[number, number]> = [];
    const half = Math.floor(w / 2);
    forEachTile(tx - half, ty - h + 1, tx + half, ty, (x, y) => cells.push([x, y]));
    return cells;
  }

  /** Whether the prop fits at (tx, ty) inside the room with `clearance` tiles of open floor all round it. */
  private standsClear(room: RoomData, def: PropDef, tx: number, ty: number, clearance: number): boolean {
    const { w, h } = def.footprint ?? { w: 1, h: 1 };
    const half = Math.floor(w / 2);
    const x0 = tx - half - clearance, x1 = tx + half + clearance;
    const y0 = ty - h + 1 - clearance, y1 = ty + clearance;
    const inside = x0 >= room.x && y0 >= room.y && x1 < room.x + room.w && y1 < room.y + room.h;
    return inside && !someTile(x0, y0, x1, y1, (x, y) => !this.free(x, y));
  }

  /** Room tiles nearest its middle first. */
  private tilesByDistanceFromMiddle(room: RoomData): TilePos[] {
    const cx = room.x + (room.w - 1) / 2;
    const cy = room.y + (room.h - 1) / 2;
    const tiles: TilePos[] = [];
    forEachTile(room.x, room.y, room.x + room.w - 1, room.y + room.h - 1, (x, y) => tiles.push({ x, y }));
    const dist = (t: TilePos) => Math.max(Math.abs(t.x - cx), Math.abs(t.y - cy));
    return tiles.sort((a, b) => dist(a) - dist(b));
  }

  /**
   * Something solid in the middle of the room with open floor around it. If pits, pillars or other props
   * fill the middle, it moves outwards — up to {@link CENTRE_SEARCH} tiles, else wherever it fits clear.
   */
  private centrepiece(room: RoomData, kinds: readonly PropKind[], props: PropPlacement[], keep: Keep): TilePos | null {
    const kind = this.pickProp(kinds);
    const def: PropDef = PROPS[kind];
    const tiles = this.tilesByDistanceFromMiddle(room);
    const cx = room.x + (room.w - 1) / 2;
    const cy = room.y + (room.h - 1) / 2;
    const near = (t: TilePos) => Math.max(Math.abs(t.x - cx), Math.abs(t.y - cy)) <= CENTRE_SEARCH;
    const fits = (t: TilePos) => this.standsClear(room, def, t.x, t.y, CENTRE_CLEARANCE);
    const spot = tiles.find((t) => near(t) && fits(t)) ?? tiles.find(fits);
    if (!spot || !this.placeLarge(kind, spot.x, spot.y, props, keep)) return null;
    if (CRYPT_CENTREPIECES.includes(kind)) for (const x of [spot.x - 1, spot.x + 1]) this.placeCandle(x, spot.y, props);
    return spot;
  }

  /** One prop blocking its whole footprint, if the dungeon stays connected. */
  private placeLarge(kind: PropKind, tx: number, ty: number, props: PropPlacement[], keep: Keep): boolean {
    const cells = this.footprintCells(PROPS[kind], tx, ty);
    if (!cells.every(([x, y]) => this.free(x, y))) return false;
    if (!keep(() => this.setTiles(cells, TileType.Obstacle))) return false;
    for (const [x, y] of cells) this.claim(x, y);
    this.blockFoot(propBlockRect(PROPS[kind]), tx, ty, cells);
    props.push({ kind, tx, ty });
    return true;
  }

  // ── Cave halls ──────────────────────────────────────────────────────────────

  /** A cave hall: great spires in the middle, smaller ones about, crystals, stones and plants of one colour. */
  private furnishCave(room: RoomData, props: PropPlacement[], keep: Keep): void {
    if (room.w >= 6 && room.h >= 6 && this.rng() < this.cfg.pitChance) this.pits(room, keep);
    this.centrepiece(room, CAVE_CENTREPIECES, props, keep);
    const open = this.shuffledFreeTiles(room);
    for (let i = this.countIn(CAVE_SPIRE_COUNT); i > 0; i--) this.scatterSolid(room, open, CAVE_SPIRES, props, keep);
    if (this.rng() < GEM_CRYSTAL_CHANCE * HALL_CRYSTAL_FACTOR) this.scatterSolid(room, open, GEM_CRYSTALS, props, keep);
    const colour = this.pick(PLANT_COLOURS);
    const plants = CAVE_PLANTS.filter((kind) => kind.endsWith(colour) || kind.includes(`${colour}_`));
    this.scatterLoose(open, CAVE_CRYSTALS, this.countIn(CAVE_CRYSTAL_COUNT), props);
    this.scatterLoose(open, CAVE_STONES, this.countIn(CAVE_STONE_COUNT), props);
    this.scatterLoose(open, plants, this.countIn(CAVE_PLANT_COUNT), props);
  }

  private countIn([min, max]: readonly [number, number]): number {
    return this.randInt(min, max);
  }

  /** The room's free floor tiles in random order (a Fisher–Yates shuffle on the level's generator). */
  private shuffledFreeTiles(room: RoomData): TilePos[] {
    const tiles: TilePos[] = [];
    forEachTile(room.x, room.y, room.x + room.w - 1, room.y + room.h - 1, (x, y) => {
      if (this.free(x, y)) tiles.push({ x, y });
    });
    for (let i = tiles.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
    }
    return tiles;
  }

  /** A solid prop on the next open tile that leaves a tile of floor round it. */
  private scatterSolid(room: RoomData, open: TilePos[], kinds: readonly PropKind[], props: PropPlacement[], keep: Keep): void {
    const kind = this.pickProp(kinds);
    const i = open.findIndex((t) => this.standsClear(room, PROPS[kind], t.x, t.y, 1));
    if (i < 0) return;
    const [spot] = open.splice(i, 1);
    this.placeLarge(kind, spot.x, spot.y, props, keep);
  }

  /** Walk-through props on the next few still-free tiles. */
  private scatterLoose(open: TilePos[], kinds: readonly PropKind[], count: number, props: PropPlacement[]): void {
    for (let placed = 0; placed < count && open.length;) {
      const spot = open.pop();
      if (!spot || !this.free(spot.x, spot.y)) continue;
      this.claim(spot.x, spot.y);
      props.push({ kind: this.pickProp(kinds), tx: spot.x, ty: spot.y });
      placed++;
    }
  }

  // ── Safe and exit rooms ─────────────────────────────────────────────────────

  /**
   * The rooms either end of the dungeon are places to gather: campfires with candles beside them, banners
   * between the torches, casks and crates in the corners with goods strewn about, and shelves or racks on
   * the north wall. Returns the campfires that were lit.
   */
  private dressGatheringRoom(room: RoomData, fires: TilePos[], torches: TilePos[], props: PropPlacement[], keep: Keep): TilePos[] {
    const lit = fires.filter((t) => this.placeFire(t, keep));
    for (const fire of lit) {
      for (const x of [fire.x - 1, fire.x + 1]) this.placeCandle(x, fire.y + 1, props);
    }
    this.hangBanners(room, torches, props);
    const corners: Array<[number, number]> = [
      [room.x, room.y], [room.x + room.w - 1, room.y], [room.x, room.y + room.h - 1], [room.x + room.w - 1, room.y + room.h - 1],
    ];
    for (const [x, y] of corners) {
      if (this.placeSolid([[x, y]], [this.pickProp(GATHERING_CORNERS)], props, keep)) this.scatterGoods(x, y, props);
    }
    this.storeroom(room, props, keep);
    this.urnsAlongWalls(room, GATHERING_URNS, props, keep);
    this.scatterLoose(this.shuffledFreeTiles(room).filter((t) => this.againstWall(t.x, t.y)), STORE_GOODS, GATHERING_GOODS, props);
    return lit;
  }

  /** A campfire on its tile, which it blocks (at its stones), if the way through stays open. */
  private placeFire(t: TilePos, keep: Keep): boolean {
    if (!this.free(t.x, t.y) || !keep(() => this.setTiles([[t.x, t.y]], TileType.Obstacle))) return false;
    this.claim(t.x, t.y);
    this.blockFoot(CAMPFIRE_BLOCK, t.x, t.y, [[t.x, t.y]]);
    return true;
  }

  /** Banners on every other free stretch of the room's north wall, clear of the torches. */
  private hangBanners(room: RoomData, torches: TilePos[], props: PropPlacement[]): void {
    const ty = room.y;
    const nearTorch = (tx: number) => torches.some((t) => t.y === ty && Math.abs(t.x - tx) < 2);
    for (let tx = room.x + 1; tx < room.x + room.w - 1; tx += 2) {
      if (!this.mountable(tx, ty) || nearTorch(tx)) continue;
      props.push({ kind: EXIT_BANNERS[(tx >> 1) % EXIT_BANNERS.length], tx, ty });
    }
  }

  /** Posts, or a matching pair of pedestals, standing either side of the middle of a plain hall. */
  private flankingPair(room: RoomData, props: PropPlacement[], keep: Keep): void {
    const y = room.y + Math.floor(room.h / 2);
    const pedestal = this.rng() < PEDESTAL_CHANCE ? this.pickProp(PEDESTALS) : null;
    this.placeSolid([[room.x + 2, y]], [pedestal ?? this.pick(POSTS)], props, keep);
    this.placeSolid([[room.x + room.w - 3, y]], [pedestal ?? this.pick(POSTS)], props, keep);
  }

  /** A rare storeroom corner: shelves, racks or supply heaps backed against the north wall, goods strewn in front. */
  private storeroom(room: RoomData, props: PropPlacement[], keep: Keep): void {
    const ty = room.y;
    const backed: number[] = [];
    for (let tx = room.x; tx < room.x + room.w; tx++) {
      if (this.isWall(tx, ty - 1) && this.free(tx, ty)) backed.push(tx);
    }
    const count = 1 + Math.floor(this.rng() * STORE_FURNITURE_MAX);
    for (let i = 0; i < count && backed.length; i++) {
      const tx = backed.splice(Math.floor(this.rng() * backed.length), 1)[0];
      if (this.placeSolid([[tx, ty]], [this.pickProp(STORE_FURNITURE)], props, keep)) this.scatterGoods(tx, ty, props);
    }
  }

  /** Up to a few sacks and bowls on free floor beside or in front of the furniture at (tx, ty). */
  private scatterGoods(tx: number, ty: number, props: PropPlacement[]): void {
    const count = Math.floor(this.rng() * (STORE_GOODS_MAX + 1));
    for (let i = 0; i < count; i++) {
      const gx = tx + this.randInt(-1, 1);
      const gy = ty + this.randInt(0, 1);
      if (!this.free(gx, gy)) continue;
      this.claim(gx, gy);
      props.push({ kind: this.pickProp(STORE_GOODS), tx: gx, ty: gy });
    }
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
      if (!fullFace || !this.isWall(tx - 1, ty - 1) || !this.isWall(tx + 2, ty - 1) || this.rng() < NICHE_SKIP_CHANCE) continue;
      if (!this.placeSolid([[tx, ty], [tx + 1, ty]], [this.pick(COFFINS), this.pick(COFFINS)], props, keep)) continue;
      const W = this.cfg.mapWidth;
      this.level.wallDecor.set(tx + (ty - 1) * W, 'niche0');
      this.level.wallDecor.set(tx + 1 + (ty - 1) * W, 'niche1');
      for (const cx of [tx - 1, tx + 2]) this.placeCandle(cx, ty, props);
      placed++;
      tx += 3;
    }
  }

  /** Sometimes stands a candle (or a cluster of them) on a free floor tile. */
  private placeCandle(tx: number, ty: number, props: PropPlacement[]): void {
    if (!this.free(tx, ty) || this.rng() >= CANDLE_CHANCE) return;
    this.claim(tx, ty);
    props.push({ kind: this.rng() < 0.5 ? 'candles' : 'candle', tx, ty });
  }

  /** A row of sarcophagi across the middle of the room, with gaps to walk between; returns whether it stands. */
  private sarcophagi(room: RoomData, props: PropPlacement[], keep: Keep): boolean {
    const ty = room.y + Math.floor(room.h / 2);
    const cells: Array<[number, number]> = [];
    for (let x = room.x + 2; x <= room.x + room.w - 3; x += 2) cells.push([x, ty]);
    return cells.length >= 2 && this.placeSolid(cells, cells.map(() => this.pick(SARCOPHAGI)), props, keep);
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

  /** Whether a tile has a wall beside it or above it. */
  private againstWall(tx: number, ty: number): boolean {
    return this.isWall(tx - 1, ty) || this.isWall(tx + 1, ty) || this.isWall(tx, ty - 1);
  }

  /** Urns (they block, like the barrels they look like) and broken pots standing against the walls. */
  private urnsAlongWalls(room: RoomData, count: number, props: PropPlacement[], keep: Keep): void {
    const spots: Array<[number, number]> = [];
    forEachTile(room.x, room.y, room.x + room.w - 1, room.y + room.h - 1, (tx, ty) => {
      if (this.free(tx, ty) && this.againstWall(tx, ty)) spots.push([tx, ty]);
    });
    for (let i = 0; i < count && spots.length; i++) {
      const [tx, ty] = spots.splice(Math.floor(this.rng() * spots.length), 1)[0];
      const kind = this.pick(URNS);
      const def: PropDef = PROPS[kind];
      if (def.solid) {
        this.placeSolid([[tx, ty]], [kind], props, keep);
        continue;
      }
      this.claim(tx, ty);
      props.push({ kind, tx, ty });
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

  private anyFloor(room: RoomData): TilePos | null {
    const cx = room.x + Math.floor(room.w / 2);
    const cy = room.y + Math.floor(room.h / 2);
    if (this.isFloor(cx, cy)) return { x: cx, y: cy };
    return firstTile(room.x, room.y, room.x + room.w - 1, room.y + room.h - 1, (tx, ty) => this.isFloor(tx, ty));
  }

  /** Only plain floor counts while checking connectivity: holes and obstacles cut a way off. */
  private readonly floorStep: StepCost = (_from, to) =>
    this.level.getTile(to % this.level.width, Math.floor(to / this.level.width))?.type === TileType.Floor ? 1 : Infinity;

  /** Whether every target can be walked to from `from` over plain floor, by Yuka's BFS over the tile graph. */
  private reachable(from: TilePos, targets: TilePos[]): boolean {
    const W = this.level.width;
    const reached = reachableTiles(tileGraphOf(this.level), from.x + from.y * W, this.floorStep);
    return targets.every((t) => reached[t.x + t.y * W] === 1);
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
  private placeTorches(): TilePos[] {
    const out: TilePos[] = [];
    for (let ty = FIXTURE_MIN_ROW; ty < this.cfg.mapHeight; ty++) this.torchRow(ty, out);
    return out;
  }

  /** Torches along one row of faces, at least `torchSpacing` apart. */
  private torchRow(ty: number, out: TilePos[]): void {
    let last = -Infinity;
    for (let tx = 1; tx < this.cfg.mapWidth - 1; tx++) {
      if (!this.mountable(tx, ty) || tx - last < this.cfg.torchSpacing || this.rng() < TORCH_SKIP_CHANCE) continue;
      last = tx;
      out.push({ x: tx, y: ty });
    }
  }

  /** Cauldrons, chains, trophies and banners hung on faces between the torches. */
  private placeHangings(torches: TilePos[], props: PropPlacement[]): void {
    for (let ty = FIXTURE_MIN_ROW; ty < this.cfg.mapHeight; ty++) this.hangingRow(ty, torches, props);
  }

  private hangingRow(ty: number, torches: TilePos[], props: PropPlacement[]): void {
    const nearTorch = (tx: number) => torches.some((t) => t.y === ty && Math.abs(t.x - tx) < 2);
    for (let tx = 1; tx < this.cfg.mapWidth - 1; tx++) {
      if (!this.mountable(tx, ty) || nearTorch(tx) || this.level.isSafeZone(tx, ty) || this.rng() > HANGING_CHANCE) continue;
      props.push({ kind: this.pickProp(HANGINGS), tx, ty });
      tx += 2;
    }
  }
}
