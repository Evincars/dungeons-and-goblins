import type { ItemSquare } from '../network/protocol';

/**
 * A throw being aimed on this screen (the inventory's Throw, ui/InventoryOverlay.ts): which square of the bag (or which worn
 * item) the hero holds ready to throw. While it is, the aim guide shows where it would land and whom it would reach
 * (systems/AimGuideSystem.ts); a left click on the world throws it there (systems/InputSystem.ts notes the click,
 * systems/ThrowAimSystem.ts sends it), a right click or Escape puts it away. Kept here, not on the hero: a guest's copy of
 * its character is overwritten by every update from the host.
 */

let readied: ItemSquare | null = null;
let clicked = false;

/** The hero takes the item on this square in hand, to throw where the next click on the world says. */
export function readyThrow(place: ItemSquare): void {
  readied = 'bag' in place ? { bag: place.bag } : { slot: place.slot };
  clicked = false;
}

/** The square whose item is held ready to throw, if any. */
export function readiedThrow(): ItemSquare | null {
  return readied;
}

/** The throw is put away (a right click, Escape, the item gone). Returns whether one was ready. */
export function cancelThrow(): boolean {
  const was = readied !== null;
  readied = null;
  clicked = false;
  return was;
}

/** A click on the world while a throw is ready: it goes on the next tick. */
export function noteThrowClick(): void {
  if (readied) clicked = true;
}

/** The throw clicked for, once (the square it comes from); the hand is empty after. */
export function takeThrowClick(): ItemSquare | null {
  if (!clicked || !readied) return null;
  const place = readied;
  cancelThrow();
  return place;
}
