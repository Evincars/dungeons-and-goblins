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
  CAVE_CENTREPIECES, CAVE_CRYSTALS, GEM_CRYSTALS, CAVE_PLANTS, CAVE_SPIRES, CAVE_STONES, COFFINS, COLD_CANDLES, CRATES, CRYPT_CENTREPIECES,
  CASTLE_BANNERS, CASTLE_BONES, CASTLE_COLD_CANDLES, CASTLE_FLAGS, CASTLE_POOL_COLUMNS, CASTLE_POTS, CASTLE_RUBBLE, CASTLE_RUGS,
  CASTLE_STORES, COLUMNS, HALL_CENTREPIECES, HANGINGS, PEDESTALS, POSTS, PROPS, SARCOPHAGI, STORE_CENTREPIECES, STORE_FURNITURE, STORE_GOODS, URNS,
  propBlockRect, propWeight,
} from '../Props';
import type { BlockRect, PropDef, PropKind, PropPlacement } from '../Props';
import { MathUtils } from 'yuka';
import { LOBE_E, LOBE_N, LOBE_S, LOBE_W, SPIKE_PIT_H, SPIKE_PIT_W } from '../PitShapes';
import { POOL_H, POOL_KINDS, POOL_W, isWallDecor } from '../Level';
import { CASTLE_FACE_DECOR } from '../CastleTiles';
import type { CastleFaceDecor } from '../CastleTiles';
import type { Pit } from '../PitShapes';
import { IsoDresser } from './IsoDresser';
import type { IsoSite } from './IsoDresser';
import { ISO_BOOKS, ISO_BRAZIERS, ISO_LECTERNS, ISO_POTS } from '../Props';

/** A tile a feature changed, and what it was, so the feature can be undone. */
export type TileChange = { x: number; y: number; prev: TileType };
/** Applies a feature and keeps it only if the dungeon stays connected (else undoes it); returns whether it stayed. */
export type Keep = (apply: () => TileChange[]) => boolean;
export type TilePos = { x: number; y: number };

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
/** Of the pits dug, this share are plain squares and this share quatrefoils; the rest have rounded lobes. */
const PIT_SQUARE_SHARE = 0.3;
const PIT_FOIL_SHARE = 0.25;
/** Chance a lobed pit bulges on each of its east, south and west sides, and that it has an arched alcove north. */
const LOBE_CHANCE = 0.55;
const ARCH_CHANCE = 0.5;
/** Chance a dungeon room's walls are cobblestone rather than brick (more often in the great cave halls). */
const COBBLE_CHANCE = 0.4;
const COBBLE_HALL_CHANCE = 0.7;
/** How far round a room its walls take its material: a tile at the sides and below, its full north face above. */
const WALL_REACH_SIDE = 1;
const WALL_REACH_NORTH = 3;
/** Castle rooms, by a roll: up to the first share a great hall, then pools, then a storeroom, else a ruin. */
const CASTLE_HALL_SHARE = 0.3;
const CASTLE_POOL_SHARE = 0.5;
const CASTLE_STORE_SHARE = 0.75;
/** Things in a castle storeroom, pots along a castle room's walls, bones strewn about, fallen stone in a ruin. */
const CASTLE_STORE_ITEMS = 5;
const CASTLE_POTS_PER_ROOM = 2;
const CASTLE_BONE_COUNT = [1, 4] as const;
const CASTLE_RUBBLE_COUNT = [2, 4] as const;
/** Chance of a burnt-out candle in a castle room, and of a lit candelabra at each end of its north wall. */
const CASTLE_COLD_CANDLE_CHANCE = 0.4;
const CANDELABRA_CHANCE = 0.6;
/** Decorated stretches of face in a castle room: at most this many, each spot skipped by this chance, this many tiles apart. */
const CASTLE_DECOR_PER_ROOM = 3;
const CASTLE_DECOR_SKIP = 0.25;
const CASTLE_DECOR_GAP = 1;
const CASTLE_DECOR_KINDS: readonly CastleFaceDecor[] = ['door', 'glass', 'ornate', 'ornate', 'gothic', 'gothic', 'gothic'];
/** Lit candles standing in an arched alcove (the 'door' stretch): none, one or two, and how far apart a pair stands (px). */
const ALCOVE_CANDLES_MAX = 2;
const ALCOVE_CANDLE_SPREAD = 7;
/** Chance of a lit candelabra on each side of a great gothic window. */
const GOTHIC_CANDELABRA_CHANCE = 0.7;
/** A castle great hall's columns are square ones (rather than slender) by this chance, and flagged by this one. */
const BLOCK_COLUMN_SHARE = 0.65;
const FLAG_CHANCE = 0.6;
/** Chance a castle room that is neither a hall nor a room of pools gets a pair of flagged columns across its middle. */
const FLAGGED_PAIR_CHANCE = 0.3;
/** Not every room is a rectangle: this share lose a corner or two, back into the wall (an L, a T, a cross). */
const ROOM_SHAPE_CHANCE = 0.55;
const ROOM_CORNERS_MAX = 2;
/**
 * A room must be this big to lose a corner; a cut is at least CORNER_MIN tiles each way (so the step it leaves has a
 * full face) and at most a third of the room each way (so its middle stays open).
 */
const SHAPED_MIN_W = 6;
const SHAPED_MIN_H = 6;
const CORNER_MIN = 2;
const CORNER_MAX_SHARE = 3;
/** Chance a plain hall has drain grates set in its floor (two, or four in a tall room), and how tall that is. */
const GRATE_CHANCE = 0.6;
const FOUR_GRATE_ROOM_H = 9;
/** Grates keep this many tiles from the walls. */
const GRATE_INSET = 2;
/** Chance a plain hall big enough is lined with columns along its north and south walls, this many tiles apart. */
const COLONNADE_CHANCE = 0.5;
const COLONNADE_STEP = 3;
const COLONNADE_MIN_W = 9;
const COLONNADE_MIN_H = 7;
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
/**
 * The big glowing crystals are left out for now. Their chance is still rolled, so a seed builds the same dungeon
 * as before around where they would have stood.
 */
const GEM_CRYSTALS_PLACED = false;
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
/** The share of candles set down that are long burnt out (no flame, no light). */
const COLD_CANDLE_SHARE = 0.25;
/**
 * How a gathering room (the safe and exit rooms) is furnished, by theme: what stands in its corners, against its north
 * wall and along its walls, and the goods strewn about.
 */
type GatheringKit = { corners: readonly PropKind[]; furniture: readonly PropKind[]; urns: readonly PropKind[]; goods: readonly PropKind[] };
const GATHERING_KIT: GatheringKit = { corners: GATHERING_CORNERS, furniture: STORE_FURNITURE, urns: URNS, goods: STORE_GOODS };
/** The isometric castle's: lecterns and stacks of books, crystal braziers by the north wall, its pots, loose books. */
const ISO_GATHERING_KIT: GatheringKit = {
  corners: [...ISO_LECTERNS, ...ISO_BOOKS.filter(isSolidProp)], furniture: ISO_BRAZIERS, urns: ISO_POTS,
  goods: ISO_BOOKS.filter((kind) => !isSolidProp(kind)),
};
/** The isometric castle's safe and exit rooms are floored in oxblood (FLOOR_BLOCKS tone 1). */
const GATHERING_TONE = 1;

function isSolidProp(kind: PropKind): boolean {
  const def: PropDef = PROPS[kind];
  return !!def.solid;
}

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
  /** The safe room's side of its doorway: players past this world-X have left it (or, for the exit room, not reached it). */
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
  /** The exit room's doorway (open until its lever is pulled), and where that lever stands. */
  exitDoor: DoorData;
  exitLeverPos: { x: number; y: number };
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
  /** Dresses the isometric castle's rooms, through the builder's own ways of setting things down. */
  private readonly iso = new IsoDresser(this.isoSite());

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
    this.level = new Level(W, H, cfg.theme);
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
    const exitDoorTiles: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < cw; i++) {
      doorTiles.push({ x: doorX, y: doorY + i });
      exitDoorTiles.push({ x: exitDoorX, y: exitDoorY + i });
    }
    // Each door's lever stands just inside its room, beside the doorway (above it when there is room).
    const leverTile = { x: doorX - 1, y: doorY - 1 >= safe.y ? doorY - 1 : doorY + cw };
    const exitLeverTile = { x: exit.x, y: exitDoorY - 1 >= exit.y ? exitDoorY - 1 : exitDoorY + cw };

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
      if (cfg.theme === 'castle2') {
        this.iso.dressRoom(room, props, keepIfReachable);
        continue;
      }
      let structured = false;
      this.shapeRoom(room, keepIfReachable);
      if (room.hall) {
        this.furnishCave(room, props, keepIfReachable);
        continue;
      }
      if (room.w >= 9 && room.h >= 8 && this.rng() < cfg.pillarChance) {
        structured = keepIfReachable(() => this.pillarBlocks(room));
      } else if (room.w >= 6 && room.h >= 6 && this.rng() < cfg.pitChance) {
        structured = this.pits(room, keepIfReachable);
      }
      if (cfg.theme === 'castle') this.furnishCastle(room, structured, props, keepIfReachable);
      else this.furnish(room, structured, props, keepIfReachable);
    }
    if (cfg.theme === 'castle') this.castleFaces(dungeonRooms, props, keepIfReachable);

    if (cfg.theme === 'catacomb') this.wallMaterials(dungeonRooms);

    // ── Safe zones ────────────────────────────────────────────────────────────
    for (const room of [safe, exit]) {
      forEachTile(room.x, room.y, room.x + room.w - 1, room.y + room.h - 1, (tx, ty) => this.level.markSafeZone(tx, ty));
    }

    // The isometric castle has no torches on its walls: crystal braziers stand on its floors instead.
    const torchTiles = cfg.theme === 'castle2' ? [] : this.placeTorches();
    if (cfg.theme !== 'castle2') this.placeHangings(torchTiles, props);
    if (cfg.theme === 'castle2') for (const room of [safe, exit]) this.level.floorZones.push({ x: room.x, y: room.y, w: room.w, h: room.h, tone: GATHERING_TONE });
    const shopTile = { x: safe.x + Math.floor(safe.w / 2), y: safe.y + 1 };
    const dummyTile = { x: safe.x + 2, y: safe.y + safe.h - 3 };
    this.usedTiles.add(dummyTile.x + dummyTile.y * W);
    // The exit, the spawn and the shop keeper's spot (and the wall behind and floor in front of it) stay clear.
    for (const t of [exitTile, playerTile, shopTile, leverTile, exitLeverTile, { x: shopTile.x, y: safe.y }, { x: shopTile.x, y: shopTile.y + 1 }]) {
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
      exitDoor: { tiles: exitDoorTiles, boundaryX: exit.x * TILE_WIDTH },
      exitLeverPos: tileCenter(exitLeverTile.x, exitLeverTile.y),
    };
  }

  /** The builder's ways of setting things down, lent to the isometric castle's dresser. */
  private isoSite(): IsoSite {
    const levelOf = (): Level => this.level;
    return {
      get level() { return levelOf(); },
      rng: () => this.rng(),
      randInt: (min, max) => this.randInt(min, max),
      free: (tx, ty) => this.free(tx, ty),
      claim: (tx, ty) => this.claim(tx, ty),
      isWall: (tx, ty) => this.isWall(tx, ty),
      isFloor: (tx, ty) => this.isFloor(tx, ty),
      setTiles: (cells, type) => this.setTiles(cells, type),
      placeSolid: (cells, kinds, props, keep) => this.placeSolid(cells, kinds, props, keep),
      scatterSolid: (room, open, kinds, props, keep) => this.scatterSolid(room, open, kinds, props, keep),
      scatterLoose: (open, kinds, count, props) => this.scatterLoose(open, kinds, count, props),
      shuffledFreeTiles: (room) => this.shuffledFreeTiles(room),
      urnsAlongWalls: (room, count, props, keep, kinds) => this.urnsAlongWalls(room, count, props, keep, kinds),
      pickProp: (kinds) => this.pickProp(kinds),
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
    // The castles keep their great rooms, but they are halls of stone, not caves.
    if (!hall || cfg.theme !== 'catacomb') return room;
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

  /**
   * Now and then cuts one or two of a room's corners back into the wall, so not every room is a rectangle. A corner a
   * corridor runs into is left whole (it would end against the wall), and so is any cut that would cut a way off.
   */
  private shapeRoom(room: RoomData, keep: Keep): void {
    if (room.w < SHAPED_MIN_W || room.h < SHAPED_MIN_H || this.rng() >= ROOM_SHAPE_CHANCE) return;
    const corners: Array<[boolean, boolean]> = [[false, false], [true, false], [false, true], [true, true]];
    // Corners in random order, until enough are cut (one a corridor comes into gives way to the next).
    let cuts = this.randInt(1, ROOM_CORNERS_MAX);
    while (cuts > 0 && corners.length) {
      const [right, bottom] = corners.splice(Math.floor(this.rng() * corners.length), 1)[0];
      if (this.cutCorner(room, right, bottom, keep)) cuts--;
    }
  }

  /** Walls up one corner of the room (the right or left one, at its bottom or top), if nothing comes in there. */
  private cutCorner(room: RoomData, right: boolean, bottom: boolean, keep: Keep): boolean {
    const w = this.randInt(CORNER_MIN, Math.floor(room.w / CORNER_MAX_SHARE));
    const h = this.randInt(CORNER_MIN, Math.floor(room.h / CORNER_MAX_SHARE));
    const x0 = right ? room.x + room.w - w : room.x;
    const y0 = bottom ? room.y + room.h - h : room.y;
    const outside = (x: number, y: number): boolean => x < room.x || y < room.y || x >= room.x + room.w || y >= room.y + room.h;
    if (someTile(x0 - 1, y0 - 1, x0 + w, y0 + h, (x, y) => outside(x, y) && !this.isWall(x, y))) return false;
    const cells: Array<[number, number]> = [];
    forEachTile(x0, y0, x0 + w - 1, y0 + h - 1, (x, y) => cells.push([x, y]));
    return keep(() => this.setTiles(cells, TileType.Wall));
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
    if (this.cfg.theme === 'castle') return this.spikePit(room, keep);
    let placed = false;
    const count = room.w >= 10 && this.rng() < SECOND_PIT_CHANCE ? 2 : 1;
    const maxX = room.x + room.w - 4;
    const maxY = room.y + room.h - 4;
    for (let i = 0; i < count && maxX >= room.x + 2 && maxY >= room.y + 2; i++) {
      if (this.placePit(room, maxX, maxY, keep)) placed = true;
    }
    return placed;
  }

  /** A castle's pit: a long framed pit of spikes (4×2 tiles) with a ring of floor round it; returns whether one was dug. */
  private spikePit(room: RoomData, keep: Keep): boolean {
    const w = SPIKE_PIT_W;
    const h = SPIKE_PIT_H;
    if (room.w < w + 2 || room.h < h + 3) return false;
    for (let attempt = 0; attempt < PIT_ATTEMPTS; attempt++) {
      const px = this.randInt(room.x + 1, room.x + room.w - w - 1);
      const py = this.randInt(room.y + 2, room.y + room.h - h - 1);
      if (someTile(px - 1, py - 1, px + w, py + h, (x, y) => !this.free(x, y))) continue;
      const cells: Array<[number, number]> = [];
      forEachTile(px, py, px + w - 1, py + h - 1, (x, y) => cells.push([x, y]));
      if (!keep(() => this.setTiles(cells, TileType.Hole))) continue;
      this.level.addPit({ x: px, y: py, shape: 'spikes', lobes: 0 });
      forEachTile(px - 1, py - 1, px + w, py + h, (x, y) => this.claim(x, y));
      return true;
    }
    return false;
  }

  /** Tries a few random spots for one pit; returns whether one was dug. */
  private placePit(room: RoomData, maxX: number, maxY: number, keep: Keep): boolean {
    for (let attempt = 0; attempt < PIT_ATTEMPTS; attempt++) {
      const px = this.randInt(room.x + 2, maxX);
      const py = this.randInt(room.y + 2, maxY);
      if (someTile(px - 1, py - 1, px + 2, py + 2, (x, y) => !this.free(x, y))) continue;
      if (!keep(() => this.setTiles([[px, py], [px + 1, py], [px, py + 1], [px + 1, py + 1]], TileType.Hole))) continue;
      const pit = this.pitShape(px, py);
      this.level.addPit(pit);
      forEachTile(px - 1, py - 1, px + 2, py + 2, (x, y) => this.claim(x, y));
      // An arched alcove reaches half a tile into the row above the ring.
      if (pit.lobes & LOBE_N) forEachTile(px, py - 2, px + 1, py - 2, (x, y) => this.claim(x, y));
      return true;
    }
    return false;
  }

  /**
   * The shape a pit at (px, py) is dug in: a plain square, a quatrefoil, or a square with rounded lobes (at least
   * one), its arched alcove only where the floor two tiles north of it is free.
   */
  private pitShape(px: number, py: number): Pit {
    const roll = this.rng();
    if (roll < PIT_SQUARE_SHARE) return { x: px, y: py, shape: 'square', lobes: 0 };
    if (roll < PIT_SQUARE_SHARE + PIT_FOIL_SHARE) return { x: px, y: py, shape: 'quatrefoil', lobes: 0 };
    let lobes = 0;
    for (const bit of [LOBE_E, LOBE_S, LOBE_W]) if (this.rng() < LOBE_CHANCE) lobes |= bit;
    const archRoom = this.free(px, py - 2) && this.free(px + 1, py - 2);
    if (archRoom && this.rng() < ARCH_CHANCE) lobes |= LOBE_N;
    return { x: px, y: py, shape: 'lobed', lobes: lobes || LOBE_S };
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
    } else {
      this.plainHall(room, structured, props, keep);
    }
    if (!middleTaken && this.rng() < CENTREPIECE_CHANCE) this.centrepiece(room, centrepieces, props, keep);
    if (this.rng() < STORE_CHANCE) this.storeroom(room, props, keep);
    const roomGem = this.rng() < GEM_CRYSTAL_CHANCE;
    if (roomGem && GEM_CRYSTALS_PLACED) this.scatterSolid(room, this.shuffledFreeTiles(room), GEM_CRYSTALS, props, keep);
    this.urnsAlongWalls(room, roll >= 0.4 && roll < 0.7 ? 4 : 2, props, keep);
  }

  // ── The castle ──────────────────────────────────────────────────────────────

  /**
   * Dresses a castle room: a great hall (columns along its walls, a rug, candelabras), a room of pools with columns
   * standing in them, a storeroom, or a ruin of fallen stone; bones and pots everywhere, candelabras by the north wall.
   */
  private furnishCastle(room: RoomData, structured: boolean, props: PropPlacement[], keep: Keep): void {
    const roll = this.rng();
    const big = room.w >= COLONNADE_MIN_W && room.h >= COLONNADE_MIN_H;
    if (roll < CASTLE_HALL_SHARE && big && !structured) this.greatHall(room, props, keep);
    else if (roll < CASTLE_POOL_SHARE && room.w >= POOL_W + 2 && room.h >= POOL_H + 3 && !structured) this.pools(room, props, keep);
    else if (roll < CASTLE_STORE_SHARE) this.urnsAlongWalls(room, CASTLE_STORE_ITEMS, props, keep, CASTLE_STORES);
    else this.ruin(room, props, keep);
    if (roll >= CASTLE_POOL_SHARE && !structured && big && this.rng() < FLAGGED_PAIR_CHANCE) this.flaggedPair(room, props, keep);
    this.candelabras(room, props, keep);
    this.urnsAlongWalls(room, CASTLE_POTS_PER_ROOM, props, keep, CASTLE_POTS);
    const open = this.shuffledFreeTiles(room);
    this.scatterLoose(open, CASTLE_BONES, this.countIn(CASTLE_BONE_COUNT), props);
    if (this.rng() < CASTLE_COLD_CANDLE_CHANCE) this.scatterLoose(open, CASTLE_COLD_CANDLES, 1, props);
  }

  /** Columns along the north and south walls (square ones flagged now and then) and a rug laid down the middle. */
  private greatHall(room: RoomData, props: PropPlacement[], keep: Keep): void {
    const square = this.rng() < BLOCK_COLUMN_SHARE;
    const first = props.length;
    this.colonnade(room, props, keep, [square ? 'castle_column_block' : 'castle_column']);
    if (square && this.rng() < FLAG_CHANCE) this.flagColumns(props.slice(first), props);
    const tx = room.x + Math.floor(room.w / 2);
    const ty = room.y + Math.floor(room.h / 2);
    if (someTile(tx - 1, ty - 1, tx + 1, ty + 1, (x, y) => !this.free(x, y))) return;
    props.push({ kind: this.pick(CASTLE_RUGS), tx, ty });
  }

  /**
   * One or two pools (water or green sludge, POOL_W×POOL_H tiles, a ring of floor round each), each with a column
   * standing in its middle.
   */
  private pools(room: RoomData, props: PropPlacement[], keep: Keep): void {
    const kind = this.pick(POOL_KINDS);
    const count = room.w >= 2 * POOL_W + 5 ? 2 : 1;
    for (let i = 0; i < count; i++) this.placePool(room, kind, props, keep);
  }

  private placePool(room: RoomData, kind: (typeof POOL_KINDS)[number], props: PropPlacement[], keep: Keep): void {
    for (let attempt = 0; attempt < PIT_ATTEMPTS; attempt++) {
      const px = this.randInt(room.x + 1, room.x + room.w - POOL_W - 1);
      const py = this.randInt(room.y + 2, room.y + room.h - POOL_H - 1);
      if (someTile(px - 1, py - 1, px + POOL_W, py + POOL_H, (x, y) => !this.free(x, y))) continue;
      const cells: Array<[number, number]> = [];
      forEachTile(px, py, px + POOL_W - 1, py + POOL_H - 1, (x, y) => cells.push([x, y]));
      if (!keep(() => this.setTiles(cells, TileType.Obstacle))) continue;
      this.level.addPool({ x: px, y: py, kind });
      forEachTile(px - 1, py - 1, px + POOL_W, py + POOL_H, (x, y) => this.claim(x, y));
      // Half a tile right of its second column of tiles: the pool's very middle.
      props.push({ kind: this.pick(CASTLE_POOL_COLUMNS), tx: px + 1, ty: py + 1, dx: TILE_WIDTH / 2 });
      return;
    }
  }

  /** A flag of one colour hung on the front of each of these columns. */
  private flagColumns(columns: readonly PropPlacement[], props: PropPlacement[]): void {
    const flag = this.pick(CASTLE_FLAGS);
    for (const column of columns) props.push({ kind: flag, tx: column.tx, ty: column.ty });
  }

  /** A pair of square columns, flagged alike, standing either side of the room's middle. */
  private flaggedPair(room: RoomData, props: PropPlacement[], keep: Keep): void {
    const y = room.y + Math.floor(room.h / 2);
    const first = props.length;
    for (const x of [room.x + 2, room.x + room.w - 3]) this.placeSolid([[x, y]], ['castle_column_block'], props, keep);
    this.flagColumns(props.slice(first), props);
  }

  /** A ruin: fallen stone and rubble lying about the room. */
  private ruin(room: RoomData, props: PropPlacement[], keep: Keep): void {
    const open = this.shuffledFreeTiles(room);
    for (let i = this.countIn(CASTLE_RUBBLE_COUNT); i > 0; i--) this.scatterSolid(room, open, CASTLE_RUBBLE, props, keep);
  }

  /** Lit candelabras (the castle's floor lights) standing by the north wall, one near each end. */
  private candelabras(room: RoomData, props: PropPlacement[], keep: Keep): void {
    for (const tx of [room.x + 1, room.x + room.w - 2]) {
      if (this.rng() < CANDELABRA_CHANCE) this.placeSolid([[tx, room.y]], ['castle_candelabra'], props, keep);
    }
  }

  /**
   * The castle's decorated stretches of north face — arched alcoves, dark stained windows, ornate panels and great
   * gothic windows — set on full-height faces (the pilasters framing them are drawn by TerrainAutotile.ts), a couple
   * to a room; candles stand lit in an alcove, candelabras beside a great window.
   */
  private castleFaces(rooms: readonly RoomData[], props: PropPlacement[], keep: Keep): void {
    for (const room of rooms) this.decorateNorthFaces(room, props, keep);
  }

  /**
   * Up to CASTLE_DECOR_PER_ROOM decorated stretches along a room's north faces, left to right and top row first: its
   * north wall, and the steps a cut corner leaves in it.
   */
  private decorateNorthFaces(room: RoomData, props: PropPlacement[], keep: Keep): void {
    let placed = 0;
    for (let ty = room.y; ty < room.y + room.h && placed < CASTLE_DECOR_PER_ROOM; ty++) {
      placed += this.decorateFaceRow(room, ty, CASTLE_DECOR_PER_ROOM - placed, props, keep);
    }
  }

  /** Up to `most` decorated stretches on the faces over floor row ty of the room; returns how many it set. */
  private decorateFaceRow(room: RoomData, ty: number, most: number, props: PropPlacement[], keep: Keep): number {
    let placed = 0;
    for (let tx = room.x; tx < room.x + room.w && placed < most; tx++) {
      if (!this.isWall(tx, ty - 1) || !this.isFloor(tx, ty)) continue;
      const kind = this.pick(CASTLE_DECOR_KINDS);
      const len = CASTLE_FACE_DECOR[kind];
      if (!this.decorFits(tx, ty, len, kind) || this.rng() < CASTLE_DECOR_SKIP) continue;
      this.markDecor(tx, ty - 1, kind, len);
      if (kind === 'door') this.alcoveCandles(tx, ty, props);
      if (kind === 'gothic') this.windowCandelabras(tx, ty, len, props, keep);
      placed++;
      tx += len + CASTLE_DECOR_GAP;
    }
    return placed;
  }

  /** None, one or two lit candles standing in the arched alcove that starts over floor tile (tx, ty), two tiles wide. */
  private alcoveCandles(tx: number, ty: number, props: PropPlacement[]): void {
    const count = this.randInt(0, ALCOVE_CANDLES_MAX);
    if (count === 0 || !this.free(tx, ty) || !this.free(tx + 1, ty)) return;
    this.claim(tx, ty);
    this.claim(tx + 1, ty);
    // The alcove's middle is the line between its two tiles: half a tile right of the first one's middle.
    const middle = TILE_WIDTH / 2;
    if (count === 1) props.push({ kind: 'castle_candle', tx, ty, dx: middle });
    else for (const side of [-1, 1]) props.push({ kind: 'castle_candle', tx, ty, dx: middle + side * ALCOVE_CANDLE_SPREAD });
  }

  /** Lit candelabras standing either side of a great window that starts over floor tile (tx, ty), each by a chance. */
  private windowCandelabras(tx: number, ty: number, len: number, props: PropPlacement[], keep: Keep): void {
    for (const x of [tx - 1, tx + len]) {
      if (this.rng() >= GOTHIC_CANDELABRA_CHANCE || this.candelabraBeside(x, ty, props)) continue;
      this.placeSolid([[x, ty]], ['castle_candelabra'], props, keep);
    }
  }

  /** Whether a candelabra already stands on the tile beside (tx, ty): two side by side would crowd the wall. */
  private candelabraBeside(tx: number, ty: number, props: readonly PropPlacement[]): boolean {
    return props.some((p) => p.kind === 'castle_candelabra' && p.ty === ty && Math.abs(p.tx - tx) === 1);
  }

  /** Marks each wall tile of a decorated stretch with its part (`gothic0`, `gothic1`…), left to right. */
  private markDecor(tx: number, wallRow: number, kind: CastleFaceDecor, len: number): void {
    for (let i = 0; i < len; i++) {
      const part = `${kind}${i}`;
      if (isWallDecor(part)) this.level.wallDecor.set(tx + i + wallRow * this.cfg.mapWidth, part);
    }
  }

  /** Whether a stretch of `len` tiles from tx fits the full-height face over floor row ty (a great window's gable needs one more wall row). */
  private decorFits(tx: number, ty: number, len: number, kind: CastleFaceDecor): boolean {
    const rows = kind === 'gothic' ? 3 : 2;
    const W = this.cfg.mapWidth;
    const plainFace = (x: number): boolean => this.isFloor(x, ty) && !isPillarColumn(x) && !this.level.wallDecor.has(x + (ty - 1) * W)
      && !someTile(x, ty - rows, x, ty - 1, (wx, wy) => !this.isWall(wx, wy));
    for (let x = tx; x < tx + len; x++) if (!plainFace(x)) return false;
    return this.isWall(tx - 1, ty - 1) && this.isWall(tx + len, ty - 1);
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
    const hallGem = this.rng() < GEM_CRYSTAL_CHANCE * HALL_CRYSTAL_FACTOR;
    if (hallGem && GEM_CRYSTALS_PLACED) this.scatterSolid(room, open, GEM_CRYSTALS, props, keep);
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
    const kit = this.cfg.theme === 'castle2' ? ISO_GATHERING_KIT : GATHERING_KIT;
    if (this.cfg.theme !== 'castle2') this.hangBanners(room, torches, props);
    const corners: Array<[number, number]> = [
      [room.x, room.y], [room.x + room.w - 1, room.y], [room.x, room.y + room.h - 1], [room.x + room.w - 1, room.y + room.h - 1],
    ];
    for (const [x, y] of corners) {
      if (this.placeSolid([[x, y]], [this.pickProp(kit.corners)], props, keep)) this.scatterGoods(x, y, props, kit.goods);
    }
    this.storeroom(room, props, keep, kit);
    this.urnsAlongWalls(room, GATHERING_URNS, props, keep, kit.urns);
    this.scatterLoose(this.shuffledFreeTiles(room).filter((t) => this.againstWall(t.x, t.y)), kit.goods, GATHERING_GOODS, props);
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
  /** A plain hall: columns along its long walls, or a pair of pedestals or posts; drain grates set in its floor. */
  private plainHall(room: RoomData, structured: boolean, props: PropPlacement[], keep: Keep): void {
    const colonnade = !structured && room.w >= COLONNADE_MIN_W && room.h >= COLONNADE_MIN_H && this.rng() < COLONNADE_CHANCE;
    if (colonnade) this.colonnade(room, props, keep);
    else if (!structured && room.w >= 8 && room.h >= 8) this.flankingPair(room, props, keep);
    if (this.rng() < GRATE_CHANCE) this.grates(room);
  }

  /** One kind of column in a row along the north wall and another along the south, a few tiles apart. */
  private colonnade(room: RoomData, props: PropPlacement[], keep: Keep, kinds: readonly PropKind[] = COLUMNS): void {
    const kind = this.pick(kinds);
    for (let x = room.x + 1; x <= room.x + room.w - 2; x += COLONNADE_STEP) {
      for (const y of [room.y + 1, room.y + room.h - 2]) this.placeSolid([[x, y]], [kind], props, keep);
    }
  }

  /**
   * Framed 2×2 drain grates mirrored across the room: two side by side, or four in a tall room. They are floor
   * (walked over) but nothing is set down on them.
   */
  private grates(room: RoomData): void {
    const xs = [room.x + GRATE_INSET, room.x + room.w - GRATE_INSET - 2];
    const middle = room.y + Math.floor((room.h - 2) / 2);
    const ys = room.h >= FOUR_GRATE_ROOM_H ? [room.y + GRATE_INSET, room.y + room.h - GRATE_INSET - 2] : [middle];
    if (xs[1] - xs[0] < 3) return;
    for (const y of ys) {
      for (const x of xs) this.placeGrate(x, y);
    }
  }

  private placeGrate(x: number, y: number): void {
    if (someTile(x, y, x + 1, y + 1, (tx, ty) => !this.free(tx, ty))) return;
    this.level.grates.push({ x, y });
    forEachTile(x, y, x + 1, y + 1, (tx, ty) => this.claim(tx, ty));
  }

  /**
   * Each dungeon room's walls are brick or cobblestone; the tiles round it (its whole north face) take its material,
   * corridors and the safe and exit rooms stay brick.
   */
  private wallMaterials(rooms: readonly RoomData[]): void {
    for (const room of rooms) {
      if (this.rng() >= (room.hall ? COBBLE_HALL_CHANCE : COBBLE_CHANCE)) continue;
      const x0 = Math.max(0, room.x - WALL_REACH_SIDE);
      const y0 = Math.max(0, room.y - WALL_REACH_NORTH);
      const x1 = Math.min(this.cfg.mapWidth - 1, room.x + room.w - 1 + WALL_REACH_SIDE);
      const y1 = Math.min(this.cfg.mapHeight - 1, room.y + room.h - 1 + WALL_REACH_SIDE);
      forEachTile(x0, y0, x1, y1, (x, y) => this.level.cobbleWalls.add(x + y * this.cfg.mapWidth));
    }
  }

  private flankingPair(room: RoomData, props: PropPlacement[], keep: Keep): void {
    const y = room.y + Math.floor(room.h / 2);
    const pedestal = this.rng() < PEDESTAL_CHANCE ? this.pickProp(PEDESTALS) : null;
    this.placeSolid([[room.x + 2, y]], [pedestal ?? this.pick(POSTS)], props, keep);
    this.placeSolid([[room.x + room.w - 3, y]], [pedestal ?? this.pick(POSTS)], props, keep);
  }

  /** A rare storeroom corner: shelves, racks or supply heaps backed against the north wall, goods strewn in front. */
  private storeroom(room: RoomData, props: PropPlacement[], keep: Keep, kit: GatheringKit = GATHERING_KIT): void {
    const ty = room.y;
    const backed: number[] = [];
    for (let tx = room.x; tx < room.x + room.w; tx++) {
      if (this.isWall(tx, ty - 1) && this.free(tx, ty)) backed.push(tx);
    }
    const count = 1 + Math.floor(this.rng() * STORE_FURNITURE_MAX);
    for (let i = 0; i < count && backed.length; i++) {
      const tx = backed.splice(Math.floor(this.rng() * backed.length), 1)[0];
      if (this.placeSolid([[tx, ty]], [this.pickProp(kit.furniture)], props, keep)) this.scatterGoods(tx, ty, props, kit.goods);
    }
  }

  /** Up to a few sacks and bowls on free floor beside or in front of the furniture at (tx, ty). */
  private scatterGoods(tx: number, ty: number, props: PropPlacement[], goods: readonly PropKind[] = STORE_GOODS): void {
    const count = Math.floor(this.rng() * (STORE_GOODS_MAX + 1));
    for (let i = 0; i < count; i++) {
      const gx = tx + this.randInt(-1, 1);
      const gy = ty + this.randInt(0, 1);
      if (!this.free(gx, gy)) continue;
      this.claim(gx, gy);
      props.push({ kind: this.pickProp(goods), tx: gx, ty: gy });
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

  /** Sometimes stands a candle (or a cluster of them) on a free floor tile; now and then one long burnt out. */
  private placeCandle(tx: number, ty: number, props: PropPlacement[]): void {
    if (!this.free(tx, ty) || this.rng() >= CANDLE_CHANCE) return;
    this.claim(tx, ty);
    const iso = this.cfg.theme === 'castle2';
    const lit: PropKind = this.rng() < 0.5 ? (iso ? 'iso_candles' : 'candles') : (iso ? 'iso_candle' : 'candle');
    // The isometric castle's candles all burn (it has no burnt-out ones of its own).
    props.push({ kind: this.rng() < COLD_CANDLE_SHARE && !iso ? this.pick(COLD_CANDLES) : lit, tx, ty });
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
  private urnsAlongWalls(room: RoomData, count: number, props: PropPlacement[], keep: Keep, kinds: readonly PropKind[] = URNS): void {
    const spots: Array<[number, number]> = [];
    forEachTile(room.x, room.y, room.x + room.w - 1, room.y + room.h - 1, (tx, ty) => {
      if (this.free(tx, ty) && this.againstWall(tx, ty)) spots.push([tx, ty]);
    });
    for (let i = 0; i < count && spots.length; i++) {
      const [tx, ty] = spots.splice(Math.floor(this.rng() * spots.length), 1)[0];
      const kind = this.pick(kinds);
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
      && !isPillarColumn(tx) && !this.level.wallDecor.has(tx + (ty - 1) * W) && !this.besideCastleDecor(tx, ty - 1);
  }

  /** Whether a castle wall tile is beside a decorated stretch, where a pilaster frames it (nothing hangs there). */
  private besideCastleDecor(tx: number, wallRow: number): boolean {
    const W = this.cfg.mapWidth;
    return this.cfg.theme === 'castle' && (this.level.wallDecor.has(tx - 1 + wallRow * W) || this.level.wallDecor.has(tx + 1 + wallRow * W));
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
      props.push({ kind: this.pickProp(this.cfg.theme === 'castle' ? CASTLE_BANNERS : HANGINGS), tx, ty });
      tx += 2;
    }
  }
}
