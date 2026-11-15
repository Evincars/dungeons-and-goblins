import type { LevelTheme } from '../Theme';

/** Configuration for the procedural dungeon generator. */
export type DungeonConfig = {
  /** What the level is built as (Theme.ts). */
  theme: LevelTheme;
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
  /**
   * Chance two neighbouring BSP partitions are left whole, making room for a hall: a big cave-floored
   * room with rock spires, crystals and plants (about one room in five).
   */
  hallChance: number;
  /** Largest hall dimension (tiles); halls are never smaller than `hallMinSize`. */
  hallMaxSize: number;
  hallMinSize: number;
  /** Rows of wall kept above a dungeon room (its north face stands in them), and below and beside it. */
  northMargin: number;
  /** Optional deterministic RNG seed (uses Date.now() if omitted). */
  seed?: number;
};

export const DEFAULT_CONFIG: DungeonConfig = {
  theme:    'catacomb',
  mapWidth:     84,
  mapHeight:    44,
  safeRoomW:    16,
  exitRoomW:    16,
  minRoomSize:   6,
  maxRoomSize:  14,
  corridorW:     2,
  splitDepth:    4,
  pillarChance: 0.45,
  pitChance:    0.25,
  enemyDensity:  3,
  torchSpacing:  5,
  hallChance:    0.55,
  hallMaxSize:  24,
  hallMinSize:  10,
  northMargin:   2,
};

/**
 * What a theme builds differently: the forgotten mines are bigger caverns on a bigger map, with deep rock above each
 * (their faces stand four tiles tall, MineTerrain.ts).
 */
const THEME_CONFIG: Readonly<Record<LevelTheme, Partial<DungeonConfig>>> = {
  catacomb: {},
  castle: {},
  castle2: {},
  mines: { mapWidth: 100, mapHeight: 56, minRoomSize: 8, maxRoomSize: 18, hallMaxSize: 26, hallMinSize: 12, northMargin: 4 },
};

/** The generator's settings for a level of this theme. */
export function dungeonConfig(theme: LevelTheme, seed?: number): DungeonConfig {
  return { ...DEFAULT_CONFIG, ...THEME_CONFIG[theme], theme, seed };
}

/**
 * Chance two rooms that share no row or column are joined by a corridor down the slant (two tiles across for every tile
 * down, generators/Slants.ts) rather than an L, where there is room for one: often in the isometric castle, now and then
 * in the others.
 */
export const SLANTED_CORRIDOR_CHANCE = { catacomb: 0.35, castle: 0.35, castle2: 0.8, mines: 0.85 } as const satisfies Record<LevelTheme, number>;
/**
 * Rooms joined along the BSP tree seldom lie diagonally from each other, so this many more corridors down the slant are
 * added between any two rooms that do (and have nothing in between): ways round, as well as slants to see.
 */
export const SLANTED_EXTRA_CORRIDORS = { catacomb: 1, castle: 1, castle2: 3, mines: 4 } as const satisfies Record<LevelTheme, number>;
/** Chance a corner a catacomb or castle room loses is cut off on the slant rather than squared off, and how deep. */
export const SLANTED_CORNER_SHARE = 0.45;
export const SLANTED_CORNER_DEPTH = [1, 2] as const;
