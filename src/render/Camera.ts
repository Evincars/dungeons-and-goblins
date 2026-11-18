/** The game is always this many pixels tall; its width follows the shape of the window. */
export const GAME_HEIGHT = 384;
/** The narrowest picture (4:3), the normal one (16:9) and the widest (21:9), in game pixels. */
const MIN_WIDTH = 512;
const NORMAL_WIDTH = 682;
const MAX_WIDTH = 896;
/** A monitor this much wider than tall (21:9 is 2.33, 32:9 3.56) is an ultrawide one, and gets a wider picture. */
const ULTRAWIDE_ASPECT = 2.1;

/**
 * The picture's width, from the shape of the monitor (not of the browser window, whose toolbars make a normal 16:9
 * screen look wider than it is): 16:9, or narrower on a squarer monitor (16:10, 4:3); only an ultrawide monitor gets more
 * dungeon to the sides, up to 21:9. The window shows it as large as fits, black bars filling the rest. Outside a browser
 * it is 16:9.
 */
function fittedWidth(): number {
  const screen = typeof window === 'undefined' ? undefined : window.screen;
  if (!screen?.width || !screen.height) return NORMAL_WIDTH;
  const aspect = Math.max(screen.width, screen.height) / Math.min(screen.width, screen.height);
  const width = Math.round((GAME_HEIGHT * aspect) / 2) * 2;
  if (aspect >= ULTRAWIDE_ASPECT) return Math.min(MAX_WIDTH, width);
  return Math.min(NORMAL_WIDTH, Math.max(MIN_WIDTH, width));
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
