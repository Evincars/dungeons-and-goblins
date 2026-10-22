import { world } from '../world';
import type { Entity } from '../world';
import { MAX_INVENTORY } from '../game/PlayerActions';
import { sound } from '../audio/SoundPlayer';
import { nearby, Sense } from '../ai/perception/spatial';

/** Items this close are picked up while the inventory is open. */
const PICKUP_RADIUS = 20;

let inventoryOpen = false;

export function isInventoryOpen(): boolean { return inventoryOpen; }

const carriers = world.with('position', 'playerInput', 'playerStats', 'inventory', 'health');
type Carrier = (typeof carriers)['entities'][number];
const lying: Entity[] = [];

/** Picks up the world items lying at the player's feet, while the bag has room. */
function pickUp(player: Carrier): void {
  const { x, y } = player.position;
  for (const e of nearby(x, y, PICKUP_RADIUS, Sense.item, lying)) {
    if (!e.item || !e.position || player.inventory.length >= MAX_INVENTORY) continue;
    player.inventory.push({ type: e.item.type, name: e.item.name, value: e.item.value });
    sound.playSound('coin', e.position.x, e.position.y);
    world.addComponent(e, 'removed', true);
  }
}

/** Tab opens and closes this screen's inventory panel; returns the local player's bag, if any. */
export function updateInventoryToggle(): Carrier | undefined {
  for (const player of carriers) {
    // The inventory is this screen's panel; a remote player opens their own.
    if (player.remoteInput) continue;
    const intents = player.playerInput.intents;
    if (intents.inventoryOpen) {
      intents.inventoryOpen = false;
      inventoryOpen = !inventoryOpen;
    }
    return player;
  }
  return undefined;
}

export function updateInventory(): void {
  const player = updateInventoryToggle();
  if (!player || !inventoryOpen) return;
  pickUp(player);
}

/** A new level starts with the panel shut. */
export function closeInventory(): void {
  inventoryOpen = false;
}
