/**
 * What a level is built as: the catacombs (brick and cobble crypts, cave halls), a castle (its own stone walls,
 * gothic windows, floors, pools and spike pits, lit by candelabras and wall candles; nothing of the catacombs or
 * caves in it), or the isometric castle (/castle-izometric: rooms with their corners cut on the slant, galleries
 * raised above the floor with stairs down from them, chasms with columns sinking into the dark; level/IsoTerrain.ts).
 * The safe and exit rooms keep their own design in the first two.
 */
export const LEVEL_THEMES = ['catacomb', 'castle', 'castle2'] as const;
export type LevelTheme = (typeof LEVEL_THEMES)[number];

export function isLevelTheme(value: unknown): value is LevelTheme {
  return LEVEL_THEMES.some((theme) => theme === value);
}

/** The tileset image (texture key) a theme's terrain is cut from. */
export function tilesetKey(theme: LevelTheme): string {
  if (theme === 'castle2') return 'iso_walls';
  return theme === 'castle' ? 'castle_tileset' : 'tileset';
}
