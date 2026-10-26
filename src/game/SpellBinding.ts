import { setInventoryOpen } from '../systems/InventorySystem';
import { QUICK_SLOTS } from '../world';
import type { Player } from '../world';
import { requestBind } from './PlayerActions';
import type { QuickBinding } from '../rules/Spellbook';

/**
 * Putting a spell on the quick bar: the inventory's Skills tab picks the spell and the level to cast it at, the
 * inventory shuts and every quick-bar square invites a click; a click on one binds the spell there, a click on
 * anything else (or Escape) gives up. Either way the inventory comes back as it was.
 */

let pending: QuickBinding | null = null;
/** Whether the pointer is over a quick-bar square (set by the bar), so a press there is a choice, not a cancel. */
let overSquare = false;

/** The spell being bound, if the player is choosing a square for one. */
export function pendingBinding(): QuickBinding | null {
  return pending;
}

export function setOverQuickSquare(over: boolean): void {
  overSquare = over;
}

/** Any press while binding that is not on a quick-bar square cancels it. */
function onPress(): void {
  if (!overSquare) cancelBinding();
}

/**
 * The click that picked the spell is still going on (its release is yet to come, and the browser's mouse press follows
 * the pointer press that started it), so presses count only once the button has come up.
 */
function onRelease(): void {
  window.removeEventListener('mouseup', onRelease, true);
  if (pending) window.addEventListener('mousedown', onPress, true);
}

function end(reopen: boolean): void {
  if (!pending) return;
  pending = null;
  overSquare = false;
  window.removeEventListener('mousedown', onPress, true);
  window.removeEventListener('mouseup', onRelease, true);
  if (reopen) setInventoryOpen(true);
}

/** Shuts the inventory and waits for a quick-bar square to be picked for this spell. */
export function beginBinding(binding: QuickBinding): void {
  end(false);
  pending = binding;
  setInventoryOpen(false);
  window.addEventListener('mouseup', onRelease, true);
}

/** Gives up: the inventory comes back unchanged. */
export function cancelBinding(): void {
  end(true);
}

/** The scene is going away: forget the binding without opening anything. */
export function abandonBinding(): void {
  end(false);
}

/** A square was picked: the spell goes there and the inventory comes back. */
export function finishBinding(player: Player, slot: number): void {
  if (!pending || slot < 0 || slot >= QUICK_SLOTS) return;
  requestBind(player, slot, pending.spell, pending.level);
  end(true);
}
