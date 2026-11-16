/**
 * The map's scale against the tabletop's: a 5-foot square (1.5 m) of D&D is 48 pixels. Spell ranges (feet) and weapon
 * ranges (metres, src/data/weapons.json) are turned into pixels with it.
 */

/** Pixels in one 5-foot (1.5 m) square of the map. */
export const PX_PER_FIVE_FEET = 48;
/** A 5-foot square in metres, as the Czech rules measure it. */
const METRES_PER_SQUARE = 1.5;

/** A distance in metres, in pixels of the map. */
export function metresToPx(metres: number): number {
  return Math.round((metres / METRES_PER_SQUARE) * PX_PER_FIVE_FEET);
}
