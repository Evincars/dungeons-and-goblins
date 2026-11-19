/**
 * What a level is built as: the catacombs (brick and cobble crypts, cave halls), a castle (its own stone walls,
 * gothic windows, floors, pools and spike pits, lit by candelabras and wall candles; nothing of the catacombs or
 * caves in it), the isometric castle (`castle2`, /castle-izometric: rooms with long slanted walls, corridors down the
 * slant with stairs in the straight ones, chasms with columns sinking into the dark; level/IsoTerrain.ts), or the
 * forgotten mines (`mines`, /caves2: caverns under tall rock faces, timbered, chasms fenced off, old pit props sinking
 * into them; level/MineTerrain.ts). The safe and exit rooms keep their own design in the first two.
 */
export const LEVEL_THEMES = ['catacomb', 'castle', 'castle2', 'mines'] as const;
export type LevelTheme = (typeof LEVEL_THEMES)[number];

export function isLevelTheme(value: unknown): value is LevelTheme {
  return LEVEL_THEMES.some((theme) => theme === value);
}

/** The tileset image (texture key) a theme's terrain is cut from. */
export function tilesetKey(theme: LevelTheme): string {
  if (theme === 'castle2') return 'iso_walls';
  if (theme === 'mines') return 'mine_walls';
  return theme === 'castle' ? 'castle_tileset' : 'tileset';
}

/**
 * How far up over the floor north of it a room's south wall (its rim and the dark under it, straight or on the slant)
 * is drawn, past the wall tile's own top edge: south walls stand taller than the tilesets draw them, so whoever steps up
 * to one sinks further behind it. Only the drawing moves, not where bodies stop.
 */
export const SOUTH_WALL_RAISE = { catacomb: 8, castle: 8, castle2: 8, mines: 8 } as const satisfies Record<LevelTheme, number>;

/**
 * Whether a theme's chasms (holes that belong to no pit) are drops anyone who walks out over them falls down (the mines'
 * abysses and great pits, with only a fence here and there along them), or gaps nobody can step into (the isometric
 * castle's).
 */
export const OPEN_CHASMS = { catacomb: true, castle: false, castle2: false, mines: true } as const satisfies Record<LevelTheme, boolean>;

/**
 * The colour of the dark beyond a level's walls and off its map: the same as the void the theme's tileset draws in its
 * wall tops, so nowhere shows a seam between the dark drawn and the dark beyond it.
 */
export const THEME_VOID = { catacomb: 0x070707, castle: 0x070707, castle2: 0x000000, mines: 0x040404 } as const satisfies Record<LevelTheme, number>;
