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

