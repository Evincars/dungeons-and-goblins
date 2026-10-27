import { world } from '../world';
import type { Level } from '../level/Level';
import { layDownItems } from '../entities/LootFactory';
import { receiveItem } from '../game/PlayerActions';
import { playerUsing } from './TargetSystem';

let inventoryOpen = false;

export function isInventoryOpen(): boolean { return inventoryOpen; }

/** Opens or shuts this screen's inventory panel (the quick bar's spell binding shuts it, then brings it back). */
export function setInventoryOpen(open: boolean): void { inventoryOpen = open; }

const carriers = world.with('position', 'playerInput', 'playerStats', 'inventory', 'health');
type Carrier = (typeof carriers)['entities'][number];
const lying = world.with('position', 'item');

/**
 * Items on the floor are taken on purpose, never by walking over them (a dropped one would be picked straight up
 * again): "use" (E, or a click) on one the corner brackets frame puts it in the bag, if it fits.
 */
function takeItems(): void {
  for (const e of lying) {
    if (e.removed) continue;
    const taker = playerUsing(e);
    if (taker && receiveItem(taker, e.item)) world.addComponent(e, 'removed', true);
  }
}

/** Tab opens and closes this screen's inventory panel (a fallen hero's stays shut: they carry nothing); returns the local player's bag, if any. */
export function updateInventoryToggle(): Carrier | undefined {
  for (const player of carriers) {
    // The inventory is this screen's panel; a remote player opens their own.
    if (player.remoteInput) continue;
    const intents = player.playerInput.intents;
    if (intents.inventoryOpen) {
      intents.inventoryOpen = false;
      inventoryOpen = !inventoryOpen;
    }
    if (player.health.current <= 0) inventoryOpen = false;
    return player;
  }
  return undefined;
}

export function updateInventory(level?: Level): void {
  updateInventoryToggle();
  layDownItems(level);
  takeItems();
}

/** A new level starts with the panel shut. */
export function closeInventory(): void {
  inventoryOpen = false;
}
