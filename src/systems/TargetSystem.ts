import { localPlayer, isPlayer } from '../world';
import type { Entity, Player } from '../world';
import { screenToWorld } from '../render/Camera';
import { pointer, wasClicked, isMouseDown } from './InputSystem';
import { isShopOpen } from './ShopSystem';
import { isInventoryOpen } from './InventorySystem';
import { nearby, Sense } from '../ai/perception/spatial';
import { MAX_MOB_RADIUS } from '../entities/MobFactory';

/** How far from the player something can be used through the crosshair. */
export const REACH = 44;
/** How close the crosshair must be to an entity's body to pick it. */
const PICK_RADIUS = 16;
/**
 * Bodies are drawn up to this far above their ground position, and are this large at most: the
 * crosshair query reaches that far so nothing pickable is missed.
 */
const MAX_DRAW_LIFT = 32;
const PICK_QUERY_RADIUS = PICK_RADIUS + MAX_MOB_RADIUS + MAX_DRAW_LIFT;

export type CrosshairTarget = 'enemy' | 'interact' | 'interactFar' | null;
let target: CrosshairTarget = null;
/** What this screen's player would use now (the thing framed by the corner brackets): under the crosshair, or the nearest in reach. */
let focus: Entity | null = null;
const users: Entity[] = [];
const around: Entity[] = [];
/** A click that was spent on using something must not turn into a swing while still held. */
let swallowHeldClick = false;
const aim = { x: 0, y: 0 };
const candidates: Entity[] = [];

/** What the crosshair is over this tick, for its colour. */
export function crosshairTarget(): CrosshairTarget {
  return target;
}

/** Something a player can use: the shop keeper, the exit, an unopened chest, the lever before it is pulled, a stash not yet searched. */
function isInteractable(e: Entity): boolean {
  if (e.removed) return false;
  return !!e.shopNpc || !!e.stash || (!!e.exitButton && !e.exitButton.activated) || (!!e.chest && !e.chest.opened) || (!!e.lever && !e.lever.pulled);
}

/** The thing this screen's player would use this tick, for the corner brackets (null when there is nothing in reach). */
export function focusedEntity(): Entity | null {
  return focus;
}

/** A living player within reach of the point who pressed "use" (E) this tick, if any. */
export function playerUsing(x: number, y: number): Player | null {
  for (const e of nearby(x, y, REACH, Sense.player, users)) {
    if (!isPlayer(e) || e.health.current <= 0 || !e.playerInput.intents.use) continue;
    if (Math.hypot(e.position.x - x, e.position.y - y) <= REACH) return e;
  }
  return null;
}

/** The usable thing nearest the player within reach. */
function nearestUsable(player: Player): Entity | null {
  const { x, y } = player.position;
  let best: Entity | null = null;
  let bestD = REACH;
  for (const e of nearby(x, y, REACH, Sense.usable, around)) {
    if (!isInteractable(e) || !e.position) continue;
    const d = Math.hypot(e.position.x - x, e.position.y - y);
    if (d > bestD) continue;
    bestD = d;
    best = e;
  }
  return best;
}

function isLiveEnemy(e: Entity): boolean {
  return !!e.ai && (e.health?.current ?? 0) > 0 && !e.removed;
}

/** How far the crosshair is from an entity's drawn body (which sits yOffset above its ground position). */
function pickDistance(e: Entity): number {
  if (!e.position) return Infinity;
  return Math.hypot(aim.x - e.position.x, aim.y - (e.position.y - (e.yOffset ?? 0)));
}

/** The enemy or usable thing under the crosshair, nearest to it first. */
function pick(): Entity | null {
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const e of nearby(aim.x, aim.y, PICK_QUERY_RADIUS, Sense.mob | Sense.usable, candidates)) {
    if (!isLiveEnemy(e) && !isInteractable(e)) continue;
    const d = pickDistance(e);
    const r = PICK_RADIUS + Math.max(e.radius?.x ?? 0, e.radius?.y ?? 0);
    if (d >= r || d >= bestD) continue;
    bestD = d;
    best = e;
  }
  return best;
}

/** Clicks on an open panel (shop rows, inventory slots) are for the UI, not the world. */
function filterClicks(intents: { attack: boolean; cast: boolean }): void {
  if (isShopOpen() || isInventoryOpen()) {
    intents.attack = false;
    intents.cast = false;
  }
  if (!swallowHeldClick) return;
  if (isMouseDown()) intents.attack = false;
  else swallowHeldClick = false;
}

/**
 * The crosshair is the player's focus: hovering an interactable within reach
 * turns a click into "use" instead of a sword swing. Enemies are just
 * highlighted — attacks and spells already fly toward the cursor.
 */
export function updateTargeting(): void {
  target = null;
  focus = null;
  const player = localPlayer();
  if (!player) return;
  const intents = player.playerInput.intents;
  filterClicks(intents);
  focus = nearestUsable(player);

  const p = pointer();
  screenToWorld(p.x, p.y, aim);
  const best = pick();
  if (!best?.position) return;
  if (best.ai) {
    target = 'enemy';
    return;
  }

  const pp = player.position;
  const inReach = Math.hypot(best.position.x - pp.x, best.position.y - pp.y) <= REACH;
  target = inReach ? 'interact' : 'interactFar';
  if (!inReach) return;
  focus = best;

  intents.attack = false;
  // Chests only open with the use key; a click on one does nothing.
  if (!wasClicked() || best.chest) return;
  intents.use = true;
  swallowHeldClick = true;
}
