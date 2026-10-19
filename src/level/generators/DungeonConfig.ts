/** Configuration for the procedural dungeon generator. */
export type DungeonConfig = {
  /** Total map width in tiles. */
  mapWidth: number;
  /** Total map height in tiles. */
  mapHeight: number;
  /** Width in tiles reserved on the left for the safe (shop) room. */
  safeRoomW: number;
  /** Width in tiles reserved on the right for the exit room. */
  exitRoomW: number;
  /** Minimum room dimension (tiles) in the dungeon area. */
  minRoomSize: number;
  /** Maximum room dimension (tiles). */
  maxRoomSize: number;
  /** Width of corridors connecting rooms. */
  corridorW: number;
  /** BSP split depth (controls room count). */
  splitDepth: number;
  /** Chance a large room gets a pair of solid wall blocks inside. */
  pillarChance: number;
  /** Chance a large room gets a pit to fall into. */
  pitChance: number;
  /** Enemies per 100 floor tiles in dungeon rooms. */
  enemyDensity: number;
  /** Minimum tiles between torches along a wall. */
  torchSpacing: number;
  /** Optional deterministic RNG seed (uses Date.now() if omitted). */
  seed?: number;
};

export const DEFAULT_CONFIG: DungeonConfig = {
  mapWidth:     84,
  mapHeight:    44,
  safeRoomW:    16,
  exitRoomW:    16,
  minRoomSize:   6,
  maxRoomSize:  14,
  corridorW:     2,
  splitDepth:    4,
  pillarChance: 0.45,
  pitChance:    0.5,
  enemyDensity:  3,
  torchSpacing:  5,
};
