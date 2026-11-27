import type { Graphics } from 'pixi.js';

/** A clock over an HUD icon: the time gone darkens a wedge of its square, from the top, clockwise. */

/** The clock starts at the top and runs clockwise. */
export const CLOCK_START = -Math.PI / 2;
export const FULL_TURN = Math.PI * 2;

/** The clock's steps round a turn (its wedge's edge follows the box's square in steps this fine). */
const WEDGE_STEPS = 48;

/** A wedge of a square `2c` across, from its middle, between two angles (clockwise): the time gone over an icon. */
export function squareWedge(g: Graphics, c: number, from: number, to: number): Graphics {
  g.moveTo(c, c);
  const steps = Math.max(1, Math.ceil(((to - from) / FULL_TURN) * WEDGE_STEPS));
  for (let i = 0; i <= steps; i++) {
    const angle = from + ((to - from) * i) / steps;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // Out along the ray to the square's edge.
    const reach = c / Math.max(Math.abs(cos), Math.abs(sin));
    g.lineTo(c + cos * reach, c + sin * reach);
  }
  return g.closePath();
}


/** The clock's veil darkens the time gone this much; the time left runs round the icon as a ring this wide, this bright. */
const VEIL_ALPHA = 0.62;
const RING_WIDTH = 1;
const RING_ALPHA = 0.9;

/**
 * The clock over an icon `size` across (as Shield's shows): the time gone darkens it clockwise from the top, and the time left
 * runs round it as a ring in `color`, shrinking as it runs out. `left`: the share still left (1: just begun).
 */
export function drawIconClock(g: Graphics, size: number, left: number, color: number): void {
  g.clear();
  const c = size / 2;
  const share = Math.max(0, Math.min(1, left));
  const gone = CLOCK_START + FULL_TURN * (1 - share);
  if (share < 1) squareWedge(g, c, CLOCK_START, gone).fill({ color: 0x000000, alpha: VEIL_ALPHA });
  if (share > 0) g.arc(c, c, c, gone, CLOCK_START + FULL_TURN).stroke({ color, alpha: RING_ALPHA, width: RING_WIDTH });
}
