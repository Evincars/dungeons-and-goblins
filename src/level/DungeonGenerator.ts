import { DungeonBuilder } from './generators/DungeonBuilder';
import { spawnDungeonEntities } from './generators/DungeonEntitySpawner';
import { DEFAULT_CONFIG } from './generators/DungeonConfig';
import type { Level } from './Level';

export type DungeonSpawns = {
  playerSpawn: { x: number; y: number };
  torchPositions: Array<{ x: number; y: number }>;
};

export function buildDungeon(): { level: Level; spawns: DungeonSpawns } {
  const layout = new DungeonBuilder(DEFAULT_CONFIG).build();
  spawnDungeonEntities(layout, DEFAULT_CONFIG);

  return {
    level: layout.level,
    spawns: {
      playerSpawn: layout.playerSpawn,
      torchPositions: layout.torchPositions,
    },
  };
}
