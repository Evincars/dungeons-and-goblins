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

/**
 * Where the view is in the world (its top left), and how far it is zoomed in on the world (the mouse wheel in a level):
 * 1 shows the picture as made, up to ZOOM_MAX twice as close, in ZOOM_STEP steps, never so close that single pixels
 * become blocks. The HUD is never zoomed.
 */
export const camera = { x: 0, y: 0, zoom: 1 };
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 2;
export const ZOOM_STEP = 0.25;

/** Zooms in (`steps` > 0) or out by whole steps, within the limits. */
export function zoomBy(steps: number): void {
  camera.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, camera.zoom + steps * ZOOM_STEP));
}

/** How much of the world the view shows across and down at the current zoom. */
export function viewWidth(): number {
  return GAME_WIDTH / camera.zoom;
}

export function viewHeight(): number {
  return VIEW_HEIGHT / camera.zoom;
}

/** The world point under a screen point; written into `out` when given, so per-tick callers allocate nothing. */
export function screenToWorld(sx: number, sy: number, out = { x: 0, y: 0 }): { x: number; y: number } {
  out.x = sx / camera.zoom + camera.x;
  out.y = sy / camera.zoom + camera.y;
  return out;
}
