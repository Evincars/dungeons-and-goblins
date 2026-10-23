import { DungeonBuilder } from './generators/DungeonBuilder';
import { spawnDecor, spawnLiveEntities } from './generators/DungeonEntitySpawner';
import { DEFAULT_CONFIG } from './generators/DungeonConfig';
import type { DungeonLayout } from './generators/DungeonBuilder';
import type { Level } from './Level';

export type DungeonSpawns = {
  playerSpawn: { x: number; y: number };
  torchPositions: Array<{ x: number; y: number }>;
};

/** Seeds are 32-bit, so they fit a network message and the builder's generator alike. */
const SEED_RANGE = 2 ** 32;

/** A fresh seed for a new level. */
export function randomSeed(): number {
  return Math.floor(Math.random() * SEED_RANGE);
}

/** A level generated ahead of time, waiting to be played. */
let prepared: { seed: number; layout: DungeonLayout } | null = null;

function layoutFor(seed: number): DungeonLayout {
  return new DungeonBuilder({ ...DEFAULT_CONFIG, seed }).build();
}

/**
 * Generates the next level's map while the current one is wrapping up (the level summary is on screen),
 * so going deeper starts a freshly generated level at once.
 */
export function prepareLevel(seed: number): void {
  if (prepared?.seed !== seed) prepared = { seed, layout: layoutFor(seed) };
}

/**
 * Builds the dungeon a seed describes and its decor. The same seed gives the same dungeon on every
 * machine, which is how co-op guests get the host's level without it being sent. Only whoever runs the
 * game (`authority`: alone, or the co-op host) also spawns what changes during play — enemies, chests,
 * the door, the exit and the shop — which guests then receive from the host.
 */
export function buildDungeon(seed: number, authority: boolean): { level: Level; spawns: DungeonSpawns; layout: DungeonLayout } {
  const config = { ...DEFAULT_CONFIG, seed };
  const layout = prepared?.seed === seed ? prepared.layout : layoutFor(seed);
  prepared = null;
  spawnDecor(layout);
  if (authority) spawnLiveEntities(layout, config);
  return { level: layout.level, spawns: spawnsOf(layout), layout };
}

function spawnsOf(layout: DungeonLayout): DungeonSpawns {
  return { playerSpawn: layout.playerSpawn, torchPositions: layout.torchPositions };
}

/**
 * A co-op guest builds the dungeon the host sent (level/LevelMap.ts): its terrain is the host's own, and the
 * decor is laid from it; the live pieces come with the host's world updates.
 */
export function buildSentDungeon(layout: DungeonLayout): { level: Level; spawns: DungeonSpawns } {
  spawnDecor(layout);
  return { level: layout.level, spawns: spawnsOf(layout) };
}
