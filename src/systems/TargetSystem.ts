import { localPlayer, q, world } from '../world';
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
const around: Entity[] = [];
/** What each "use" pressed this tick goes to: one thing per press, the thing the player's brackets frame. */
const usedBy = new Map<Entity, Player>();
/** The kinds of thing that can be used. */
const USABLE = Sense.usable | Sense.item;
/** A click that was spent on using something must not turn into a swing while still held. */
let swallowHeldClick = false;
const aim = { x: 0, y: 0 };
const candidates: Entity[] = [];

/** What the crosshair is over this tick, for its colour. */
export function crosshairTarget(): CrosshairTarget {
  return target;
}

/**
 * Something a player can use: the shop keeper, the exit, an unopened chest, the lever before it is pulled, a prop
 * not yet searched, an item lying on the floor.
 */
function isInteractable(e: Entity): boolean {
  if (e.removed) return false;
  const closed = (!!e.exitButton && !e.exitButton.activated) || (!!e.chest && !e.chest.opened) || (!!e.lever && !e.lever.pulled);
  return closed || !!e.shopNpc || !!e.stash || !!e.item;
}

/** The thing this screen's player would use this tick, for the corner brackets (null when there is nothing in reach). */
export function focusedEntity(): Entity | null {
  return focus;
}

/** The living player who pressed "use" (E) on this thing this tick, if any (each press uses one thing). */
export function playerUsing(thing: Entity): Player | null {
  return usedBy.get(thing) ?? null;
}

/**
 * Host, each tick after the targeting: every press of "use" goes to the one thing its player's brackets frame —
 * this screen's player's focus (under the crosshair, or the nearest in reach); for a guest, the thing nearest the
 * crosshair their browser sent, if one is in reach, or else the nearest.
 */
export function resolveUses(): void {
  usedBy.clear();
  const me = localPlayer();
  for (const player of q.players) {
    if (player.health.current <= 0 || !player.playerInput.intents.use) continue;
    const thing = player === me && isFramed(player, focus) ? focus : remoteTarget(player);
    if (thing) usedBy.set(thing, player);
  }
}

/** Whether the brackets' thing is still there to be used by this player (in the world, usable, in reach). */
function isFramed(player: Player, e: Entity | null): e is Entity {
  return !!e && world.id(e) !== undefined && isInteractable(e) && inReach(player, e);
}

/** What a guest's "use" is for: the usable thing in their reach nearest their crosshair, or the nearest to them. */
function remoteTarget(player: Player): Entity | null {
  const aimAt = player.aimWorld;
  if (!aimAt) return nearestUsable(player);
  aim.x = aimAt.x;
  aim.y = aimAt.y;
  const picked = pick();
  return picked && !picked.ai && inReach(player, picked) ? picked : nearestUsable(player);
}

function inReach(player: Player, e: Entity): boolean {
  return !!e.position && Math.hypot(e.position.x - player.position.x, e.position.y - player.position.y) <= REACH;
}

/** The usable thing nearest the player within reach. */
function nearestUsable(player: Player): Entity | null {
  const { x, y } = player.position;
  let best: Entity | null = null;
  let bestD = REACH;
  for (const e of nearby(x, y, REACH, USABLE, around)) {
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
  for (const e of nearby(aim.x, aim.y, PICK_QUERY_RADIUS, Sense.mob | USABLE, candidates)) {
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

  const reached = inReach(player, best);
  target = reached ? 'interact' : 'interactFar';
  if (!reached) return;
  focus = best;

  intents.attack = false;
  // Chests only open with the use key; a click on one does nothing.
  if (!wasClicked() || best.chest) return;
  intents.use = true;
  swallowHeldClick = true;
}
