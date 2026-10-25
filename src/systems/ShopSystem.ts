import { world, isPlayer } from '../world';
import type { Entity, InventoryItem } from '../world';
import { playerUsing, REACH } from './TargetSystem';
import { nearby, Sense } from '../ai/perception/spatial';

let shopOpen = false;
let activeItems: InventoryItem[] = [];

export function isShopOpen(): boolean { return shopOpen; }
export function activeShopItems(): InventoryItem[] { return activeItems; }
export function closeShop(): void { shopOpen = false; }

const keepers = world.with('position', 'shopNpc');
const customers: Entity[] = [];

/** Lets the living players near one keeper toggle its shop with "use" (aimed at the keeper); returns whether any stood near. */
function visit(keeper: (typeof keepers)['entities'][number]): boolean {
  let near = false;
  for (const e of nearby(keeper.position.x, keeper.position.y, REACH, Sense.player, customers)) {
    // The shop is this screen's panel: only the local player opens it (guests buy through the host).
    if (!isPlayer(e) || e.remoteInput || e.health.current <= 0) continue;
    near = true;
    if (playerUsing(keeper) !== e) continue;
    shopOpen = !shopOpen;
    activeItems = keeper.shopNpc.items;
  }
  return near;
}

/** Opens/closes the shop when a player near the NPC presses "use"; closes it on walk-away. */
export function updateShop(): void {
  let nearNpc = false;
  for (const keeper of keepers) {
    if (visit(keeper)) nearNpc = true;
  }
  if (!nearNpc) shopOpen = false;
}
