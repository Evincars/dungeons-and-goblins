/** Configuration for the procedural dungeon generator. */
export type DungeonConfig = {
  /** Total map width in tiles. */
  mapWidth: number;
  /** Total map height in tiles. */
  mapHeight: number;
  /** Width in tiles of the left safe (shop) room. */
  safeRoomW: number;
  /** Width in tiles of the right exit room. */
  exitRoomW: number;
  /** Minimum room dimension (tiles) in the dungeon area. */
  minRoomSize: number;
  /** Maximum room dimension (tiles) — rooms may be smaller after clipping. */
  maxRoomSize: number;
  /** Width of corridors connecting rooms. */
  corridorW: number;
  /** Target BSP split depth (controls room count). */
  splitDepth: number;
  /** Enemies per 100 floor tiles in dungeon rooms. */
  enemyDensity: number;
  /** Items per 100 floor tiles in dungeon rooms. */
  itemDensity: number;
  /** Place a torch every N tiles along a room perimeter. */
  torchSpacing: number;
  /** Optional deterministic RNG seed (uses Date.now() if omitted). */
  seed?: number;
};

export const DEFAULT_CONFIG: DungeonConfig = {
  mapWidth:    80,
  mapHeight:   40,
  safeRoomW:   14,
  exitRoomW:   14,
  minRoomSize:  6,
  maxRoomSize: 14,
  corridorW:    3,
  splitDepth:   4,
  enemyDensity: 4,
  itemDensity:  2,
  torchSpacing: 10,
};
