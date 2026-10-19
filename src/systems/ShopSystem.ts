import { world } from '../world';
import type { InventoryItem } from '../world';

const USE_RANGE = 28;

let shopOpen = false;
let activeItems: InventoryItem[] = [];

export function isShopOpen(): boolean { return shopOpen; }
export function activeShopItems(): InventoryItem[] { return activeItems; }
export function closeShop(): void { shopOpen = false; }

/** Opens/closes the shop when a player near the NPC presses "use"; closes it on walk-away. */
export function updateShop(): void {
  let nearNpc = false;

  for (const npc of world.with('position', 'shopNpc')) {
    const npos = npc.position!;
    for (const player of world.with('position', 'playerInput', 'health')) {
      if (player.health!.current <= 0) continue;
      const pp = player.position!;
      if (Math.hypot(pp.x - npos.x, pp.y - npos.y) > USE_RANGE) continue;
      nearNpc = true;
      if (player.playerInput!.intents.use) {
        player.playerInput!.intents.use = false;
        shopOpen = !shopOpen;
        activeItems = npc.shopNpc!.items;
      }
    }
  }

  if (!nearNpc) shopOpen = false;
}
