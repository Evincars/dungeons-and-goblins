export const GAME_WIDTH  = 512;
export const GAME_HEIGHT = 384;
export const SCALE       = 2;
export const PANEL_HEIGHT = 80;
export const VIEW_HEIGHT  = GAME_HEIGHT - PANEL_HEIGHT;

export const camera = { x: 0, y: 0 };

/** The world point under a screen point; written into `out` when given, so per-tick callers allocate nothing. */
export function screenToWorld(sx: number, sy: number, out = { x: 0, y: 0 }): { x: number; y: number } {
  out.x = sx + camera.x;
  out.y = sy + camera.y;
  return out;
}
