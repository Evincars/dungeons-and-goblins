import { world, isPlayer } from '../world';
import type { Entity } from '../world';
import { playerUsing, REACH } from './TargetSystem';
import { nearby, Sense } from '../ai/perception/spatial';

let shopOpen = false;
let activeKeeper: Entity | null = null;

export function isShopOpen(): boolean { return shopOpen; }
/** The trader whose trade panel this screen has open (or last had). */
export function activeTrader(): Entity | null { return activeKeeper; }
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
    activeKeeper = keeper;
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
