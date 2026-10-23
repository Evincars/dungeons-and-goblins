import { q, isPlayer } from '../world';
import type { BagSquare, EquipSlot, Entity, InventoryItem, Player, PlayerSlot } from '../world';
import { sound } from '../audio/SoundPlayer';
import { coop } from '../network/CoopSession';
import type { GuestCommand, ItemSquare } from '../network/protocol';
import { logLine } from '../systems/RollLogSystem';
import { text } from '../core/texts';
import { nearby, Sense } from '../ai/perception/spatial';
import { REACH } from '../systems/TargetSystem';
import { fitsSlot, statTotals } from '../entities/Items';
import { isEquipSlot } from '../world';
import { BASE_SPRINT } from '../entities/PlayerFactory';
import { queueRestRequest, spendHitDie } from './Rest';
import { queueAnswer } from './Party';
import { chooseLoot } from './LootRoll';
import { applyCustomization } from './Customize';

/**
 * What players do from the shop and inventory panels. In a lone game or on the host it happens at once;
 * a guest's screen only asks, and the host checks the request and carries it out for that character
 * (the host owns the world, so a guest changing its own copy would be undone by the next update).
 */

/** The bag is a grid of this many squares across and down; it holds one item per square. */
export const INVENTORY_COLS = 6;
export const INVENTORY_ROWS = 7;
export const MAX_INVENTORY = INVENTORY_COLS * INVENTORY_ROWS;
/** Sword tier (how far a swing reaches) with nothing equipped; each point of strength on gear adds one. */
const BASE_SWORD_TIER = 1;
/** What each point of a stat on worn gear gives besides its ability score: ticks of sprint (Constitution) and a share more coins (Charisma). */
const SPRINT_PER_CONSTITUTION = 10;
const LOOT_PER_CHARISMA = 0.05;

export type Loadout = { inventory: BagSquare[]; equipped: Partial<Record<EquipSlot, InventoryItem>> };

/** A square of the inventory screen: one in the bag's grid, or an equipment slot. */
export type ItemPlace = ItemSquare;

/** Kilograms a player can carry, bag and worn gear together. */
export const MAX_CARRY_KG = 100;

/** The items in a bag, without its empty squares. */
export function bagItems(inventory: readonly BagSquare[]): InventoryItem[] {
  return inventory.flatMap((square) => (square ? [square] : []));
}

/** The first empty square of the bag (squares past its end count as empty), or -1 when it is full. */
export function freeSquare(inventory: readonly BagSquare[]): number {
  for (let i = 0; i < MAX_INVENTORY; i++) if (!inventory[i]) return i;
  return -1;
}

/** Everything a player carries — bag and worn gear — in kilograms. */
export function carriedWeight(player: Pick<Player, 'inventory' | 'equipped'>): number {
  const items = [...bagItems(player.inventory ?? []), ...Object.values(player.equipped ?? {})];
  return items.reduce((sum, item) => sum + (item?.weight ?? 0), 0);
}

/** Puts an item in the first empty square, if there is one and it isn't too heavy to carry; returns whether it went in. */
export function addToBag(player: Player, item: InventoryItem): boolean {
  const inventory = player.inventory ?? (player.inventory = []);
  const square = freeSquare(inventory);
  if (square < 0 || carriedWeight(player) + (item.weight ?? 0) > MAX_CARRY_KG) return false;
  inventory[square] = item;
  return true;
}

/** A bag with its trailing empty squares dropped (the squares themselves stay put). */
function trimmed(inventory: BagSquare[]): BagSquare[] {
  let end = inventory.length;
  while (end > 0 && !inventory[end - 1]) end--;
  inventory.length = end;
  for (let i = 0; i < end; i++) inventory[i] ??= null;
  return inventory;
}

function itemAt(loadout: Loadout, place: ItemPlace): InventoryItem | undefined {
  return ('bag' in place ? loadout.inventory[place.bag] : loadout.equipped[place.slot]) ?? undefined;
}

/** Within the bag the item goes to the square it was dropped on; anything already there takes its old square. */
function bagToBag(next: Loadout, from: number, to: number, item: InventoryItem): Loadout {
  next.inventory[from] = next.inventory[to] ?? null;
  next.inventory[to] = item;
  return next;
}

/** Worn if it fits the slot; what was worn there takes its square in the bag. */
function bagToSlot(next: Loadout, from: number, slot: EquipSlot, item: InventoryItem): Loadout | null {
  if (!fitsSlot(item, slot)) return null;
  next.inventory[from] = next.equipped[slot] ?? null;
  next.equipped[slot] = item;
  return next;
}

/** Between slots (a sword from one hand to the other): both must fit where they end up. */
function slotToSlot(next: Loadout, from: EquipSlot, to: EquipSlot, item: InventoryItem): Loadout | null {
  const worn = next.equipped[to];
  if (!fitsSlot(item, to) || (worn && !fitsSlot(worn, from))) return null;
  next.equipped[to] = item;
  if (worn) next.equipped[from] = worn;
  else delete next.equipped[from];
  return next;
}

/** Taken off onto a bag square: an empty one takes it; an item there that fits the slot swaps into it. */
function slotToBag(next: Loadout, slot: EquipSlot, bag: number, item: InventoryItem): Loadout | null {
  const there = next.inventory[bag];
  if (there && !fitsSlot(there, slot)) return null;
  next.inventory[bag] = item;
  if (there) next.equipped[slot] = there;
  else delete next.equipped[slot];
  return next;
}

/**
 * Dragging an item from one square of the inventory screen to another. Returns the new arrangement, or null
 * when the move is not allowed (a helmet dropped on the legs slot, or nothing was there to move).
 */
export function moveItem(loadout: Loadout, from: ItemPlace, to: ItemPlace): Loadout | null {
  const item = itemAt(loadout, from);
  if (!item || ('bag' in to && (to.bag < 0 || to.bag >= MAX_INVENTORY))) return null;
  const next: Loadout = { inventory: [...loadout.inventory], equipped: { ...loadout.equipped } };
  const moved = 'bag' in from
    ? ('bag' in to ? bagToBag(next, from.bag, to.bag, item) : bagToSlot(next, from.bag, to.slot, item))
    : ('bag' in to ? slotToBag(next, from.slot, to.bag, item) : slotToSlot(next, from.slot, to.slot, item));
  if (moved) trimmed(moved.inventory);
  return moved;
}

/** The player sitting in a room seat, if it is in the world. */
export function playerInSlot(slot: PlayerSlot): Player | undefined {
  for (const player of q.players) if (player.playerSlot === slot) return player;
  return undefined;
}

/** Buys one item for the player (if they can pay, have a free square and can carry it); returns whether it was bought. */
export function buy(player: Player, item: InventoryItem): boolean {
  const { x, y } = player.position;
  if (player.playerStats.gold < item.value || !addToBag(player, { ...item })) {
    sound.playSound('fail', x, y);
    return false;
  }
  player.playerStats.gold -= item.value;
  sound.playSound('buy', x, y);
  return true;
}

/** Buying from the shop panel: at once here, or through the host for a guest. */
export function requestBuy(player: Player, items: readonly InventoryItem[], index: number): void {
  const item = items[index];
  if (!item) return;
  if (coop.role === 'guest') coop.sendCommand({ kind: 'buy', index });
  else buy(player, item);
}

/**
 * Puts the bag and equipment in the given arrangement and works out what the worn gear gives beyond the
 * ability scores the rules read (src/rules/CharacterSheet.ts: attacks, damage, Armor Class): Strength
 * lengthens a swing's reach, Constitution lengthens sprints and Charisma makes enemies drop more coins.
 */
export function applyLoadout(player: Player, loadout: Loadout): void {
  player.inventory = loadout.inventory;
  player.equipped = loadout.equipped;
  const stats = statTotals(loadout.equipped);
  const ps = player.playerStats;
  ps.swordTier = BASE_SWORD_TIER + stats.strength;
  ps.maxSprint = BASE_SPRINT + stats.constitution * SPRINT_PER_CONSTITUTION;
  ps.lootBonus = stats.charisma * LOOT_PER_CHARISMA;
}

/**
 * Q: the 1st and 2nd weapon trade hands (a lone weapon in the 2nd hand moves to the 1st). Nothing happens
 * when the 2nd hand holds a shield, which cannot be the weapon fought with; returns whether they swapped.
 */
export function swapWeapons(player: Player): boolean {
  const next = moveItem({ inventory: player.inventory ?? [], equipped: player.equipped ?? {} }, { slot: 'secondary' }, { slot: 'primary' });
  if (!next) return false;
  applyLoadout(player, next);
  return true;
}

/** Rearranging the inventory panel: shown at once, and for a guest also sent to the host to make it real. */
export function requestLoadout(player: Player, loadout: Loadout): void {
  applyLoadout(player, loadout);
  if (coop.role === 'guest') coop.sendCommand({ kind: 'loadout', ...loadout });
}

const itemKey = (item: InventoryItem): string =>
  JSON.stringify([item.type, item.name, item.value, item.gear, item.icon, item.stats, item.base, item.bonus]);

/** Every item a loadout holds, bag and equipment alike, as a sorted list of keys. */
function contents(loadout: Loadout): string[] {
  const items = [...loadout.inventory, ...Object.values(loadout.equipped)];
  return items.flatMap((item) => (item ? [itemKey(item)] : [])).sort();
}

/** A rearrangement may move items between the bag and the equipment slots, never add or remove one. */
export function sameItems(a: Loadout, b: Loadout): boolean {
  const x = contents(a);
  const y = contents(b);
  return x.length === y.length && x.every((key, i) => key === y[i]);
}

/** Equipment goes in a slot of its kind only: a helmet cannot be held as a weapon. */
function slotsFit(equipped: Loadout['equipped']): boolean {
  return Object.entries(equipped).every(([slot, item]) => !item || (isEquipSlot(slot) && fitsSlot(item, slot)));
}

const keepers: Entity[] = [];

/** The shop keeper within reach of the player, if any. */
function keeperNear(player: Player): Entity | undefined {
  const { x, y } = player.position;
  return nearby(x, y, REACH, Sense.usable, keepers).find((e) => !!e.shopNpc);
}

/**
 * Hands the item on a square of the giver's inventory to another player, into the first free square of their
 * bag (if they can carry it). Returns whether it went.
 */
export function giveItem(giver: Player, from: ItemPlace, to: PlayerSlot): boolean {
  const receiver = playerInSlot(to);
  const loadout: Loadout = { inventory: [...(giver.inventory ?? [])], equipped: { ...giver.equipped } };
  const item = itemAt(loadout, from);
  if (!item || !receiver || receiver === giver) return false;
  if (!addToBag(receiver, item)) {
    logLine(giver, text('roll.cannot_carry', { name: receiver.playerName ?? '' }), 'miss');
    sound.playSound('fail', giver.position.x, giver.position.y);
    return false;
  }
  if ('bag' in from) loadout.inventory[from.bag] = null;
  else delete loadout.equipped[from.slot];
  applyLoadout(giver, { inventory: trimmed(loadout.inventory), equipped: loadout.equipped });
  logLine(receiver, text('roll.gift', { item: item.name }), 'gold');
  sound.playSound('buy', receiver.position.x, receiver.position.y);
  return true;
}

/** The inventory's "Send to": at once here, or asked of the host for a guest. */
export function requestGive(player: Player, from: ItemPlace, to: PlayerSlot): void {
  if (coop.role === 'guest') coop.sendCommand({ kind: 'give', from, to });
  else giveItem(player, from, to);
}

/** Host: carries out what a guest asked for, if it is allowed for that guest's character. */
export function handleGuestCommand(slot: PlayerSlot, command: GuestCommand): void {
  // Answers to the party count from the fallen too.
  if (command.kind === 'vote_answer') return queueAnswer(slot, command.agree);
  if (command.kind === 'loot') return chooseLoot(slot, command.roll, command.need);
  const player = playerInSlot(slot);
  if (!isPlayer(player) || player.health.current <= 0) return;
  if (command.kind === 'buy') {
    const item = keeperNear(player)?.shopNpc?.items[command.index];
    if (item) buy(player, item);
    return;
  }
  if (command.kind === 'hit_die') {
    spendHitDie(player);
    return;
  }
  if (command.kind === 'scores' || command.kind === 'fighting_style' || command.kind === 'improve' || command.kind === 'lock_build') {
    applyCustomization(player, command);
    return;
  }
  if (command.kind === 'rest') return queueRestRequest(slot, command.rest);
  if (command.kind === 'give') {
    giveItem(player, command.from, command.to);
    return;
  }
  const current: Loadout = { inventory: player.inventory ?? [], equipped: player.equipped ?? {} };
  const proposed: Loadout = { inventory: command.inventory.slice(0, MAX_INVENTORY), equipped: command.equipped };
  if (sameItems(current, proposed) && slotsFit(proposed.equipped)) applyLoadout(player, proposed);
}
