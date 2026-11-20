/**
 * The map's scale against the tabletop's: a 5-foot square of D&D is 48 pixels. Every distance the game tells or reads —
 * spell ranges (src/data/spellbook.json) and weapon ranges (src/data/weapons.json) — is in feet, turned into pixels here.
 */

/** Pixels in one 5-foot square of the map. */
export const PX_PER_FIVE_FEET = 48;
/** A square's side in feet. */
const FEET_PER_SQUARE = 5;

/** A distance in feet, in pixels of the map. */
export function feetToPx(feet: number): number {
  return Math.round((feet / FEET_PER_SQUARE) * PX_PER_FIVE_FEET);
}

/** A distance on the map in feet, to the nearest foot. */
export function pxToFeet(px: number): number {
  return Math.round((px / PX_PER_FIVE_FEET) * FEET_PER_SQUARE);
}
