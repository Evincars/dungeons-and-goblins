/** The game is always this many pixels tall; its width follows the shape of the window. */
export const GAME_HEIGHT = 384;
/** The narrowest picture (4:3) and the widest (21:9), in game pixels. */
const MIN_WIDTH = 512;
const MAX_WIDTH = 896;

/**
 * A width that matches the window's shape when the game starts, so a widescreen monitor is filled edge
 * to edge (more dungeon to the sides) instead of showing a 4:3 box. Outside a browser it is 4:3.
 */
function fittedWidth(): number {
  if (typeof window === 'undefined' || !window.innerWidth || !window.innerHeight) return MIN_WIDTH;
  const width = Math.round((GAME_HEIGHT * window.innerWidth) / window.innerHeight / 2) * 2;
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width));
}

export const GAME_WIDTH = fittedWidth();
/** Menus are laid out for the 4:3 width and centred on wider screens, this far from the left edge. */
export const LAYOUT_WIDTH = MIN_WIDTH;
export const LAYOUT_LEFT = Math.floor((GAME_WIDTH - LAYOUT_WIDTH) / 2);
/** The world fills the whole screen; the HUD (bars and quick bar) floats over its bottom edge. */
export const VIEW_HEIGHT = GAME_HEIGHT;

/** Screen pixels per game pixel that make the picture as large as the window allows. */
export function displayScale(): number {
  if (typeof window === 'undefined' || !window.innerWidth) return 1;
  return Math.min(window.innerWidth / GAME_WIDTH, window.innerHeight / GAME_HEIGHT);
}

export const camera = { x: 0, y: 0 };

/** The world point under a screen point; written into `out` when given, so per-tick callers allocate nothing. */
export function screenToWorld(sx: number, sy: number, out = { x: 0, y: 0 }): { x: number; y: number } {
  out.x = sx + camera.x;
  out.y = sy + camera.y;
  return out;
}
