import { DungeonBuilder } from './generators/DungeonBuilder';
import { spawnDecor, spawnLiveEntities } from './generators/DungeonEntitySpawner';
import { DEFAULT_CONFIG } from './generators/DungeonConfig';
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

/**
 * Builds the dungeon a seed describes and its decor. The same seed gives the same dungeon on every
 * machine, which is how co-op guests get the host's level without it being sent. Only whoever runs the
 * game (`authority`: alone, or the co-op host) also spawns what changes during play — enemies, chests,
 * the door, the exit and the shop — which guests then receive from the host.
 */
export function buildDungeon(seed: number, authority: boolean): { level: Level; spawns: DungeonSpawns } {
  const config = { ...DEFAULT_CONFIG, seed };
  const layout = new DungeonBuilder(config).build();
  spawnDecor(layout);
  if (authority) spawnLiveEntities(layout, config);
  return {
    level: layout.level,
    spawns: { playerSpawn: layout.playerSpawn, torchPositions: layout.torchPositions },
  };
}
