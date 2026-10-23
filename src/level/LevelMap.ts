import { Level, isWallDecor } from './Level';
import type { WallDecor } from './Level';
import { createTile, TileType } from './TileType';
import type { DungeonSpawns } from './DungeonGenerator';
import { ensure } from '../core/errors';
import { isFiniteNumber, isRecord } from '../core/guards';
import { gunzipJson, gzipText } from '../core/compression';

/**
 * A generated level as plain JSON: everything the terrain and the rules need (tiles, safe rooms, cave
 * ground, wall niches, pits, prop footprints, spawn points), so a map can be saved, or sent to a client
 * gzipped instead of rebuilt from its seed. Tiles are one byte each (type and image variant) in base64;
 * sets of tiles are runs of consecutive indices. Reading a map checks all of it, as anything from outside.
 */

export const MAP_FORMAT = 'dungeons-and-goblins/map';
export const MAP_VERSION = 1;
/** A tile's byte: its type in the high bits, its image variant (0–15) in the low four. */
const VARIANT_BITS = 4;
const VARIANT_MASK = (1 << VARIANT_BITS) - 1;
/** The largest map read back, in tiles across or down, and the most a packed map may unpack to (bytes). */
const MAX_SIDE = 512;
const MAX_UNPACKED = 4_000_000;
const TILE_TYPES: readonly TileType[] = [TileType.Floor, TileType.Wall, TileType.BreakableWall, TileType.Hole, TileType.Obstacle];

type Pair = [number, number];

export type LevelMap = {
  format: typeof MAP_FORMAT;
  version: typeof MAP_VERSION;
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
  pits: Pair[];
  respawns: Pair[];
  playerSpawn: Pair;
  torches: Pair[];
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

/** The level (and where the party starts and the torches stand) as a map. */
export function encodeLevelMap(level: Level, spawns: DungeonSpawns): LevelMap {
  const bytes = new Uint8Array(level.width * level.height);
  for (let i = 0; i < bytes.length; i++) {
    const tile = level.getTile(i % level.width, Math.floor(i / level.width));
    bytes[i] = tile ? (tile.type << VARIANT_BITS) | (tile.imageVariant & VARIANT_MASK) : 0;
  }
  return {
    format: MAP_FORMAT, version: MAP_VERSION, width: level.width, height: level.height,
    tiles: bytesToBase64(bytes),
    safe: toRuns(level.safeZoneTiles),
    cave: toRuns(level.caveFloor),
    wallDecor: [...level.wallDecor],
    blocks: [...level.blockBoxes].map(([i, b]) => [i, b.x0, b.y0, b.x1, b.y1]),
    pits: level.pits.map((p) => [p.x, p.y]),
    respawns: level.respawnPoints.map((p) => [p.x, p.y]),
    playerSpawn: [spawns.playerSpawn.x, spawns.playerSpawn.y],
    torches: spawns.torchPositions.map((p) => [p.x, p.y]),
  };
}

// ── Reading ───────────────────────────────────────────────────────────────────

const isPair = (v: unknown): v is Pair => Array.isArray(v) && v.length === 2 && v.every(isFiniteNumber);
const isList = (v: unknown, item: (x: unknown) => boolean): v is unknown[] => Array.isArray(v) && v.every(item);
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
  ensure(typeof value.tiles === 'string' && isList(value.safe, isPair) && isList(value.cave, isPair) && isList(value.pits, isPair)
    && isList(value.respawns, isPair) && isList(value.torches, isPair) && isPair(value.playerSpawn), 'Malformed map');
  ensure(isList(value.wallDecor, (d) => Array.isArray(d) && d.length === 2 && Number.isInteger(d[0]) && isWallDecor(d[1])), 'Bad wall decor');
  ensure(isList(value.blocks, isFootprint), 'Bad prop footprint');
}

/** A level and its spawns from a map; throws a ValidationError for anything that doesn't hold together. */
export function decodeLevelMap(value: unknown): { level: Level; spawns: DungeonSpawns } {
  checkShape(value);
  const level = new Level(value.width, value.height);
  const tiles = value.width * value.height;
  layTiles(level, base64ToBytes(value.tiles));
  eachInRuns(value.safe, tiles, (i) => level.markSafeZone(i % value.width, Math.floor(i / value.width)));
  eachInRuns(value.cave, tiles, (i) => level.caveFloor.add(i));
  for (const [i, decor] of value.wallDecor) level.wallDecor.set(i, decor);
  for (const [i, x0, y0, x1, y1] of value.blocks) level.blockBoxes.set(i, { x0, y0, x1, y1 });
  for (const [x, y] of value.pits) level.pits.push({ x, y });
  for (const [x, y] of value.respawns) level.addSpawnPoint(x, y);
  level.clearDirty();
  const [sx, sy] = value.playerSpawn;
  return { level, spawns: { playerSpawn: { x: sx, y: sy }, torchPositions: value.torches.map(([x, y]) => ({ x, y })) } };
}

/** The map gzipped, as it would go over the network. */
export function packLevelMap(map: LevelMap): Promise<Uint8Array> {
  return gzipText(JSON.stringify(map));
}

/** A packed map read back (checked in full). */
export async function unpackLevelMap(bytes: Uint8Array): Promise<{ level: Level; spawns: DungeonSpawns }> {
  return decodeLevelMap(await gunzipJson(bytes, MAX_UNPACKED, 'Map'));
}
