import { world } from '../world';
import type { Entity, InventoryItem } from '../world';
import { sound } from '../audio/SoundPlayer';
import { nearby, Sense } from '../ai/perception/spatial';

const MAX_INVENTORY = 8;
/** Items this close are picked up while the inventory is open. */
const PICKUP_RADIUS = 20;
/** Highest sword and armour tier a scroll or armour piece can raise to. */
const MAX_TIER = 4;

let inventoryOpen = false;

export function isInventoryOpen(): boolean { return inventoryOpen; }

const carriers = world.with('position', 'playerInput', 'playerStats', 'inventory', 'health');
type Carrier = (typeof carriers)['entities'][number];
const lying: Entity[] = [];

function applyItem(player: Carrier, item: InventoryItem): void {
  const h = player.health;
  const stats = player.playerStats;
  switch (item.type) {
    case 'health_potion':
    case 'mana_potion':
      h.current = Math.min(h.max, h.current + item.value);
      sound.playSound('potion');
      break;
    case 'sword_scroll':
      stats.swordTier = Math.min(MAX_TIER, stats.swordTier + 1);
      sound.playSound('level_up');
      break;
    case 'armor_piece':
      stats.armorTier = Math.min(MAX_TIER, stats.armorTier + 1);
      sound.playSound('level_up');
      break;
  }
}

/** Uses the first item in the bag. */
function useFirst(player: Carrier): void {
  const first = player.inventory[0];
  if (!first) return;
  applyItem(player, first);
  player.inventory.splice(0, 1);
}

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
  const intents = player.playerInput.intents;
  if (intents.inventoryUse) {
    intents.inventoryUse = false;
    useFirst(player);
  }
  pickUp(player);
}

/** A new level starts with the panel shut. */
export function closeInventory(): void {
  inventoryOpen = false;
}
