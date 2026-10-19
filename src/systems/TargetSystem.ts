import { world } from '../world';
import type { Entity } from '../world';
import { screenToWorld } from '../render/Camera';
import { pointer, wasClicked, isMouseDown } from './InputSystem';
import { isShopOpen } from './ShopSystem';
import { isInventoryOpen } from './InventorySystem';

/** How far from the player something can be used through the crosshair. */
export const REACH = 44;
/** How close the crosshair must be to an entity's body to pick it. */
const PICK_RADIUS = 16;

export type CrosshairTarget = 'enemy' | 'interact' | 'interactFar' | null;
let target: CrosshairTarget = null;
/** A click that was spent on using something must not turn into a swing while still held. */
let swallowHeldClick = false;

/** What the crosshair is over this tick, for its colour. */
export function crosshairTarget(): CrosshairTarget {
  return target;
}

function isInteractable(e: Entity): boolean {
  return !!e.shopNpc || (!!e.exitButton && !e.exitButton.activated) || (!!e.chest && !e.chest.opened);
}

/**
 * The crosshair is the player's focus: hovering an interactable within reach
 * turns a click into "use" instead of a sword swing. Enemies are just
 * highlighted — attacks and spells already fly toward the cursor.
 */
export function updateTargeting(): void {
  target = null;
  const player = [...world.with('playerInput', 'position', 'health')][0];
  if (!player) return;
  const intents = player.playerInput!.intents;

  // Clicks on an open panel (shop rows, inventory slots) are for the UI, not the world.
  if (isShopOpen() || isInventoryOpen()) {
    intents.attack = false;
    intents.cast = false;
  }
  if (swallowHeldClick) {
    if (isMouseDown()) intents.attack = false;
    else swallowHeldClick = false;
  }

  const p = pointer();
  const aim = screenToWorld(p.x, p.y);

  let best: Entity | null = null;
  let bestD = Infinity;
  for (const e of world.with('position')) {
    const enemy = !!e.ai && (e.health?.current ?? 0) > 0 && !e.removed;
    if (!enemy && !isInteractable(e)) continue;
    // Pick against the drawn body, which sits yOffset above the ground position.
    const d = Math.hypot(aim.x - e.position!.x, aim.y - (e.position!.y - (e.yOffset ?? 0)));
    const r = PICK_RADIUS + Math.max(e.radius?.x ?? 0, e.radius?.y ?? 0);
    if (d < r && d < bestD) { bestD = d; best = e; }
  }
  if (!best) return;

  if (best.ai) { target = 'enemy'; return; }

  const pp = player.position!;
  const inReach = Math.hypot(best.position!.x - pp.x, best.position!.y - pp.y) <= REACH;
  target = inReach ? 'interact' : 'interactFar';
  if (!inReach) return;

  intents.attack = false;
  if (wasClicked()) {
    intents.use = true;
    swallowHeldClick = true;
  }
}
