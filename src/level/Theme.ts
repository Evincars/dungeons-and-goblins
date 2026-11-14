/**
 * What a level is built as: the catacombs (brick and cobble crypts, cave halls) or a castle (its own stone walls,
 * gothic windows, floors, pools and spike pits, lit by candelabras and wall candles; nothing of the catacombs or
 * caves in it). The safe and exit rooms keep their own design either way.
 */
export const LEVEL_THEMES = ['catacomb', 'castle'] as const;
export type LevelTheme = (typeof LEVEL_THEMES)[number];

export function isLevelTheme(value: unknown): value is LevelTheme {
  return LEVEL_THEMES.some((theme) => theme === value);
}

/** The tileset image (texture key) a theme's terrain is cut from. */
export function tilesetKey(theme: LevelTheme): string {
  return theme === 'castle' ? 'castle_tileset' : 'tileset';
}
