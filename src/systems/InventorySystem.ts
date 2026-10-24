import { world, isPlayer, q } from '../world';
import type { Entity } from '../world';
import { addToBag } from '../game/PlayerActions';
import { sound } from '../audio/SoundPlayer';
import { nearby, Sense } from '../ai/perception/spatial';

/** Items lying this close to a player's feet are picked up as they walk over them. */
const PICKUP_RADIUS = 14;

let inventoryOpen = false;

export function isInventoryOpen(): boolean { return inventoryOpen; }

const carriers = world.with('position', 'playerInput', 'playerStats', 'inventory', 'health');
type Carrier = (typeof carriers)['entities'][number];
const lying: Entity[] = [];

/** Picks up the things lying at a player's feet, as long as there is a free square and it isn't too heavy. */
function pickUp(player: Entity): void {
  if (!isPlayer(player) || player.health.current <= 0) return;
  const { x, y } = player.position;
  for (const e of nearby(x, y, PICKUP_RADIUS, Sense.item, lying)) {
    if (!e.item || !e.position || e.removed || !addToBag(player, e.item)) continue;
    sound.playSound('pickup', e.position.x, e.position.y);
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
  updateInventoryToggle();
  for (const player of q.players) pickUp(player);
}

/** A new level starts with the panel shut. */
export function closeInventory(): void {
  inventoryOpen = false;
}
