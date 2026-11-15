import { Level, isWallDecor } from './Level';
import type { WallDecor } from './Level';
import { createTile, TileType } from './TileType';
import { PROPS } from './Props';
import { ALL_LOBES, PIT_SHAPES } from './PitShapes';
import { LEVEL_THEMES } from './Theme';
import { FLOOR_TONES, POOL_KINDS, STAIR_DIRS } from './Level';
import { SLOPE_CODES, slopeCode, slopeOf } from './Slopes';
import type { PropKind } from './Props';
import type { DungeonLayout, RoomData, RoomType } from './generators/DungeonBuilder';
import { ensure } from '../core/errors';
import { hasKey, isFiniteNumber, isRecord } from '../core/guards';
import { gunzipJson, gzipText } from '../core/compression';

/**
 * A generated dungeon as plain JSON, so the co-op host can send its clients the very map it built (and a
 * map can be saved): the terrain (tiles, safe rooms, cave ground, wall niches and cobblestone walls, shaped pits, floor
 * grates, prop footprints, spawn
 * points), the decor every screen draws for itself (rooms, torches, props, campfires — the level's assets)
 * and where the live pieces stand (shop, exit, training dummy, the doors and levers of the safe and exit rooms). Tiles are
 * one byte each (type and image variant) in base64; sets of tiles are runs of consecutive indices; props are
 * [kind, tile x, tile y]. Reading a map checks all of it, as anything from outside.
 */

export const MAP_FORMAT = 'dungeons-and-goblins/map';
export const MAP_VERSION = 7;
/** A tile's byte: its type in the high bits, its image variant (0–15) in the low four. */
const VARIANT_BITS = 4;
const VARIANT_MASK = (1 << VARIANT_BITS) - 1;
/** The largest map read back, in tiles across or down, and the most a packed map may unpack to (bytes). */
const MAX_SIDE = 512;
const MAX_UNPACKED = 4_000_000;
const TILE_TYPES: readonly TileType[] = [TileType.Floor, TileType.Wall, TileType.BreakableWall, TileType.Hole, TileType.Obstacle];

type Pair = [number, number];
/** A pit: [tile x, tile y, shape (index in PIT_SHAPES), lobes (bits)]. */
type PitRow = [number, number, number, number];
const ROOM_TYPES: readonly RoomType[] = ['safe', 'dungeon', 'exit'];
/** A room: [id, type, cave hall (1) or not (0), x, y, w, h, centre x, centre y]. */
type RoomRow = [number, RoomType, number, number, number, number, number, number, number];

export type LevelMap = {
  format: typeof MAP_FORMAT;
  version: typeof MAP_VERSION;
  /** What the level is built as: an index in LEVEL_THEMES. */
  theme: number;
  width: number;
  height: number;
  /** One byte per tile, row by row, base64. */
  tiles: string;
  /** Safe-room tiles and cave-hall tiles, as [first index, count] runs. */
  safe: Pair[];
  cave: Pair[];
  wallDecor: Array<[number, WallDecor]>;
  /** Props blocking less than their whole tile: [tile index, x0, y0, x1, y1]. */
  blocks: Array<[number, number, number, number, number]>;
  pits: PitRow[];
  /** Tiles whose wall faces are cobblestone, as runs. */
  cobble: Pair[];
  grates: Pair[];
  /** A castle's pools: [tile x, tile y, kind (index in POOL_KINDS)]. */
  pools: Array<[number, number, number]>;
  /** The isometric castle's slanted walls: [tile index, slope code (Slopes.ts)]. */
  slopes: Pair[];
  /** Its floor tones: [x, y, w, h, tone], laid in order. */
  zones: Array<[number, number, number, number, number]>;
  /** Its flights of stairs: [top-left tile x, y, which way they climb (index in STAIR_DIRS)]. */
  stairs: Array<[number, number, number]>;
  respawns: Pair[];
  playerSpawn: Pair;
  torches: Pair[];
  rooms: RoomRow[];
  /** [kind, tile x, tile y], with a fourth for a prop moved across its tile ([…, dx]). */
  props: Array<[PropKind, number, number] | [PropKind, number, number, number]>;
  campfires: Pair[];
  exitButton: Pair;
  shop: Pair;
  dummy: Pair;
  lever: Pair;
  door: { tiles: Pair[]; boundaryX: number };
  exitLever: Pair;
  exitDoor: { tiles: Pair[]; boundaryX: number };
};

/** Consecutive indices folded into [first, count] runs. */
function toRuns(indices: Iterable<number>): Pair[] {
  const runs: Pair[] = [];
  for (const i of [...indices].sort((a, b) => a - b)) {
    const last = runs[runs.length - 1];
    if (last && last[0] + last[1] === i) last[1]++;
    else runs.push([i, 1]);
  }
  return runs;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBytes(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

const pair = (p: { x: number; y: number }): Pair => [p.x, p.y];
const point = ([x, y]: Pair) => ({ x, y });

/** A generated dungeon as a map. */
export function encodeLevelMap(layout: DungeonLayout): LevelMap {
  const { level } = layout;
  const bytes = new Uint8Array(level.width * level.height);
  for (let i = 0; i < bytes.length; i++) {
    const tile = level.getTile(i % level.width, Math.floor(i / level.width));
    bytes[i] = tile ? (tile.type << VARIANT_BITS) | (tile.imageVariant & VARIANT_MASK) : 0;
  }
  return {
    format: MAP_FORMAT, version: MAP_VERSION, theme: LEVEL_THEMES.indexOf(level.theme), width: level.width, height: level.height,
    tiles: bytesToBase64(bytes),
    safe: toRuns(level.safeZoneTiles),
    cave: toRuns(level.caveFloor),
    wallDecor: [...level.wallDecor],
    blocks: [...level.blockBoxes].map(([i, b]) => [i, b.x0, b.y0, b.x1, b.y1]),
    pits: level.pits.map((p) => [p.x, p.y, PIT_SHAPES.indexOf(p.shape), p.lobes]),
    cobble: toRuns(level.cobbleWalls),
    grates: level.grates.map(pair),
    pools: level.pools.map((p) => [p.x, p.y, POOL_KINDS.indexOf(p.kind)]),
    slopes: [...level.slopes].map(([i, slope]) => [i, slopeCode(slope)]),
    zones: level.floorZones.map((z) => [z.x, z.y, z.w, z.h, z.tone]),
    stairs: level.stairs.map((s) => [s.x, s.y, STAIR_DIRS.indexOf(s.dir)]),
    respawns: level.respawnPoints.map(pair),
    playerSpawn: pair(layout.playerSpawn),
    torches: layout.torchPositions.map(pair),
    rooms: layout.rooms.map((r) => [r.id, r.type, r.hall ? 1 : 0, r.x, r.y, r.w, r.h, r.centerX, r.centerY]),
    props: layout.props.map((p) => (p.dx === undefined ? [p.kind, p.tx, p.ty] : [p.kind, p.tx, p.ty, p.dx])),
    campfires: layout.campfires.map(pair),
    exitButton: pair(layout.exitButtonPos),
    shop: pair(layout.shopPos),
    dummy: pair(layout.dummyPos),
    lever: pair(layout.leverPos),
    door: { tiles: layout.safeDoor.tiles.map(pair), boundaryX: layout.safeDoor.boundaryX },
    exitLever: pair(layout.exitLeverPos),
    exitDoor: { tiles: layout.exitDoor.tiles.map(pair), boundaryX: layout.exitDoor.boundaryX },
  };
}

// ── Reading ───────────────────────────────────────────────────────────────────

const isPair = (v: unknown): v is Pair => Array.isArray(v) && v.length === 2 && v.every(isFiniteNumber);
const isPoolRow = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every(Number.isInteger) && v[2] >= 0 && v[2] < POOL_KINDS.length;
const isPitRow = (v: unknown): v is PitRow => Array.isArray(v) && v.length === 4 && v.every(Number.isInteger)
  && v[2] >= 0 && v[2] < PIT_SHAPES.length && v[3] >= 0 && v[3] <= ALL_LOBES;
const isList = (v: unknown, item: (x: unknown) => boolean): v is unknown[] => Array.isArray(v) && v.every(item);
const isPropKind = (v: unknown): v is PropKind => typeof v === 'string' && hasKey(PROPS, v);
const isRoomRow = (v: unknown): v is RoomRow => Array.isArray(v) && v.length === 9 && ROOM_TYPES.some((t) => t === v[1])
  && [v[0], v[2], v[3], v[4], v[5], v[6], v[7], v[8]].every(isFiniteNumber);
const isPropRow = (v: unknown) => Array.isArray(v) && (v.length === 3 || (v.length === 4 && isFiniteNumber(v[3])))
  && isPropKind(v[0]) && Number.isInteger(v[1]) && Number.isInteger(v[2]);
const isSlopeRow = (v: unknown) => Array.isArray(v) && v.length === 2 && v.every(Number.isInteger) && v[1] >= 0 && v[1] < SLOPE_CODES;
const isStairsRow = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every(Number.isInteger) && v[2] >= 0 && v[2] < STAIR_DIRS.length;
const isZoneRow = (v: unknown) => Array.isArray(v) && v.length === 5 && v.every(Number.isInteger) && v[4] >= 0 && v[4] < FLOOR_TONES;
/** A doorway: its tiles, and where its room's side of it begins. */
const isDoor = (v: unknown) => isRecord(v) && isList(v.tiles, isPair) && isFiniteNumber(v.boundaryX);
/** A prop footprint: a whole tile index, then four pixel bounds. */
const isFootprint = (v: unknown): v is number[] => Array.isArray(v) && v.length === 5 && Number.isInteger(v[0]) && v.every(isFiniteNumber);

/** Marks every tile of a list of runs, after checking each lies on the map. */
function eachInRuns(runs: readonly Pair[], tiles: number, mark: (index: number) => void): void {
  for (const [first, count] of runs) {
    ensure(Number.isInteger(first) && Number.isInteger(count) && first >= 0 && count > 0 && first + count <= tiles, 'Map run off the map');
    for (let i = first; i < first + count; i++) mark(i);
  }
}

/** The tile bytes on a fresh level, after checking each names a tile type. */
function layTiles(level: Level, bytes: Uint8Array): void {
  ensure(bytes.length === level.width * level.height, 'Map tiles do not fill the map');
  for (let i = 0; i < bytes.length; i++) {
    const type = TILE_TYPES.find((t) => t === bytes[i] >> VARIANT_BITS);
    ensure(type !== undefined, 'Unknown map tile', { index: i });
    level.setTile(i % level.width, Math.floor(i / level.width), createTile(type, bytes[i] & VARIANT_MASK));
  }
}

function checkShape(value: unknown): asserts value is LevelMap {
  ensure(isRecord(value) && value.format === MAP_FORMAT && value.version === MAP_VERSION, 'Not a map, or an unknown version');
  const { width, height } = value;
  ensure(Number.isInteger(width) && Number.isInteger(height) && Number(width) > 0 && Number(height) > 0
    && Number(width) <= MAX_SIDE && Number(height) <= MAX_SIDE, 'Bad map size');
  ensure(typeof value.tiles === 'string' && isList(value.safe, isPair) && isList(value.cave, isPair) && isList(value.pits, isPitRow)
    && isList(value.cobble, isPair) && isList(value.grates, isPair) && isList(value.pools, isPoolRow)
    && Number.isInteger(value.theme) && Number(value.theme) >= 0 && Number(value.theme) < LEVEL_THEMES.length
    && isList(value.respawns, isPair) && isList(value.torches, isPair) && isPair(value.playerSpawn), 'Malformed map');
  ensure(isList(value.wallDecor, (d) => Array.isArray(d) && d.length === 2 && Number.isInteger(d[0]) && isWallDecor(d[1])), 'Bad wall decor');
  ensure(isList(value.blocks, isFootprint), 'Bad prop footprint');
  ensure(isList(value.slopes, isSlopeRow) && isList(value.zones, isZoneRow) && isList(value.stairs, isStairsRow), 'Bad slopes, floor zones or stairs');
  ensure(isList(value.rooms, isRoomRow) && isList(value.props, isPropRow) && isList(value.campfires, isPair), 'Bad map decor');
  ensure([value.exitButton, value.shop, value.dummy, value.lever, value.exitLever].every(isPair), 'Bad map positions');
  ensure(isDoor(value.door) && isDoor(value.exitDoor), 'Bad map door');
}

function roomOf([id, type, hall, x, y, w, h, centerX, centerY]: RoomRow): RoomData {
  return { id, type, ...(hall ? { hall: true } : {}), x, y, w, h, centerX, centerY };
}

/** The dungeon a map describes; throws a ValidationError for anything that doesn't hold together. */
export function decodeLevelMap(value: unknown): DungeonLayout {
  checkShape(value);
  const level = new Level(value.width, value.height, LEVEL_THEMES[value.theme]);
  const tiles = value.width * value.height;
  layTiles(level, base64ToBytes(value.tiles));
  eachInRuns(value.safe, tiles, (i) => level.markSafeZone(i % value.width, Math.floor(i / value.width)));
  eachInRuns(value.cave, tiles, (i) => level.caveFloor.add(i));
  for (const [i, decor] of value.wallDecor) level.wallDecor.set(i, decor);
  for (const [i, x0, y0, x1, y1] of value.blocks) level.blockBoxes.set(i, { x0, y0, x1, y1 });
  eachInRuns(value.cobble, tiles, (i) => level.cobbleWalls.add(i));
  for (const [x, y, shape, lobes] of value.pits) level.addPit({ x, y, shape: PIT_SHAPES[shape], lobes });
  for (const [x, y] of value.grates) level.grates.push({ x, y });
  for (const [x, y, kind] of value.pools) level.addPool({ x, y, kind: POOL_KINDS[kind] });
  for (const [i, code] of value.slopes) {
    ensure(i >= 0 && i < tiles, 'Slope off the map', { index: i });
    level.slopes.set(i, slopeOf(code));
  }
  for (const [x, y, w, h, tone] of value.zones) level.floorZones.push({ x, y, w, h, tone });
  for (const [x, y, dir] of value.stairs) level.stairs.push({ x, y, dir: STAIR_DIRS[dir] });
  for (const [x, y] of value.respawns) level.addSpawnPoint(x, y);
  level.clearDirty();
  return {
    level,
    rooms: value.rooms.map(roomOf),
    playerSpawn: point(value.playerSpawn),
    torchPositions: value.torches.map(point),
    props: value.props.map(([kind, tx, ty, dx]) => (dx === undefined ? { kind, tx, ty } : { kind, tx, ty, dx })),
    campfires: value.campfires.map(point),
    exitButtonPos: point(value.exitButton),
    shopPos: point(value.shop),
    dummyPos: point(value.dummy),
    leverPos: point(value.lever),
    safeDoor: { tiles: value.door.tiles.map(point), boundaryX: value.door.boundaryX },
    exitDoor: { tiles: value.exitDoor.tiles.map(point), boundaryX: value.exitDoor.boundaryX },
    exitLeverPos: point(value.exitLever),
  };
}

/** The map gzipped, as it would go over the network. */
export function packLevelMap(map: LevelMap): Promise<Uint8Array> {
  return gzipText(JSON.stringify(map));
}

/** A packed map read back (checked in full). */
export async function unpackLevelMap(bytes: Uint8Array): Promise<DungeonLayout> {
  return decodeLevelMap(await gunzipJson(bytes, MAX_UNPACKED, 'Map'));
}
