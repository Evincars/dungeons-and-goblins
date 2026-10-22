import { q, isPlayer } from '../world';
import type { EquipSlot, Entity, InventoryItem, Player, PlayerSlot } from '../world';
import { sound } from '../audio/SoundPlayer';
import { coop } from '../network/CoopSession';
import type { GuestCommand } from '../network/protocol';
import { nearby, Sense } from '../ai/perception/spatial';
import { REACH } from '../systems/TargetSystem';
import { fitsSlot, statTotals } from '../entities/Items';
import { isEquipSlot } from '../world';
import { BASE_MANA, BASE_SPRINT } from '../entities/PlayerFactory';

/**
 * What players do from the shop and inventory panels. In a lone game or on the host it happens at once;
 * a guest's screen only asks, and the host checks the request and carries it out for that character
 * (the host owns the world, so a guest changing its own copy would be undone by the next update).
 */

/** The bag is a grid of this many squares across and down; it holds one item per square. */
export const INVENTORY_COLS = 6;
export const INVENTORY_ROWS = 7;
export const MAX_INVENTORY = INVENTORY_COLS * INVENTORY_ROWS;
/** Sword tier with nothing equipped; each point of strength on gear adds one. */
const BASE_SWORD_TIER = 1;
/** What each point of a stat on worn gear gives: ticks of sprint (Stamina), mana (Mana), spell damage (Intelligence), and a share more coins (Luck). */
const SPRINT_PER_STAMINA = 10;
const MANA_PER_POINT = 5;
const SPELL_DAMAGE_PER_INTELLIGENCE = 2;
const LOOT_PER_LUCK = 0.05;

export type Loadout = { inventory: InventoryItem[]; equipped: Partial<Record<EquipSlot, InventoryItem>> };

/** A square of the inventory screen: one in the bag's grid, or an equipment slot. */
export type ItemPlace = { bag: number } | { slot: EquipSlot };

function itemAt(loadout: Loadout, place: ItemPlace): InventoryItem | undefined {
  return 'bag' in place ? loadout.inventory[place.bag] : loadout.equipped[place.slot];
}

/** Within the bag the item simply moves to the square it was dropped on (the bag has no gaps). */
function bagToBag(next: Loadout, from: number, to: number, item: InventoryItem): Loadout {
  next.inventory.splice(from, 1);
  next.inventory.splice(Math.min(to, next.inventory.length), 0, item);
  return next;
}

/** Worn if it fits the slot; what was worn there takes its square in the bag. */
function bagToSlot(next: Loadout, from: number, slot: EquipSlot, item: InventoryItem): Loadout | null {
  if (!fitsSlot(item, slot)) return null;
  const worn = next.equipped[slot];
  next.equipped[slot] = item;
  if (worn) next.inventory.splice(from, 1, worn);
  else next.inventory.splice(from, 1);
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

/** Taken off into the bag: an item there that fits the slot swaps into it, otherwise this one just makes room. */
function slotToBag(next: Loadout, slot: EquipSlot, bag: number, item: InventoryItem): Loadout | null {
  const there = next.inventory[bag];
  if (there && fitsSlot(there, slot)) {
    next.inventory[bag] = item;
    next.equipped[slot] = there;
    return next;
  }
  if (next.inventory.length >= MAX_INVENTORY) return null;
  delete next.equipped[slot];
  next.inventory.splice(Math.min(bag, next.inventory.length), 0, item);
  return next;
}

/**
 * Dragging an item from one square of the inventory screen to another. Returns the new arrangement, or null
 * when the move is not allowed (a helmet dropped on the legs slot, or nothing was there to move).
 */
export function moveItem(loadout: Loadout, from: ItemPlace, to: ItemPlace): Loadout | null {
  const item = itemAt(loadout, from);
  if (!item) return null;
  const next: Loadout = { inventory: [...loadout.inventory], equipped: { ...loadout.equipped } };
  if ('bag' in from) return 'bag' in to ? bagToBag(next, from.bag, to.bag, item) : bagToSlot(next, from.bag, to.slot, item);
  return 'bag' in to ? slotToBag(next, from.slot, to.bag, item) : slotToSlot(next, from.slot, to.slot, item);
}

/** The player sitting in a room seat, if it is in the world. */
export function playerInSlot(slot: PlayerSlot): Player | undefined {
  for (const player of q.players) if (player.playerSlot === slot) return player;
  return undefined;
}

/** Buys one item for the player; returns whether it was paid for. */
export function buy(player: Player, item: InventoryItem): boolean {
  const inventory = player.inventory ?? (player.inventory = []);
  const { x, y } = player.position;
  if (player.playerStats.gold < item.value || inventory.length >= MAX_INVENTORY) {
    sound.playSound('fail', x, y);
    return false;
  }
  player.playerStats.gold -= item.value;
  inventory.push({ ...item });
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
 * Puts the bag and equipment in the given arrangement and works out what the worn gear gives: Strength
 * sharpens the sword (and arrows), Defence turns blows, Stamina lengthens sprints, Mana deepens the mana
 * pool, Intelligence strengthens spells and Luck makes enemies drop more coins.
 */
export function applyLoadout(player: Player, loadout: Loadout): void {
  player.inventory = loadout.inventory;
  player.equipped = loadout.equipped;
  const stats = statTotals(loadout.equipped);
  const ps = player.playerStats;
  ps.swordTier = BASE_SWORD_TIER + stats.strength;
  ps.armorTier = stats.defence;
  ps.maxSprint = BASE_SPRINT + stats.stamina * SPRINT_PER_STAMINA;
  ps.maxMana = BASE_MANA + stats.mana * MANA_PER_POINT;
  ps.mana = Math.min(ps.mana, ps.maxMana);
  ps.spellBonus = stats.intelligence * SPELL_DAMAGE_PER_INTELLIGENCE;
  ps.lootBonus = stats.luck * LOOT_PER_LUCK;
}

/** Rearranging the inventory panel: shown at once, and for a guest also sent to the host to make it real. */
export function requestLoadout(player: Player, loadout: Loadout): void {
  applyLoadout(player, loadout);
  if (coop.role === 'guest') coop.sendCommand({ kind: 'loadout', ...loadout });
}

const itemKey = (item: InventoryItem): string => JSON.stringify([item.type, item.name, item.value, item.gear, item.icon, item.stats]);

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

/** Equipment goes in a slot of its kind only: a helmet cannot be worn as boots. */
function slotsFit(equipped: Loadout['equipped']): boolean {
  return Object.entries(equipped).every(([slot, item]) => !item || (isEquipSlot(slot) && fitsSlot(item, slot)));
}

const keepers: Entity[] = [];

/** The shop keeper within reach of the player, if any. */
function keeperNear(player: Player): Entity | undefined {
  const { x, y } = player.position;
  return nearby(x, y, REACH, Sense.usable, keepers).find((e) => !!e.shopNpc);
}

/** Host: carries out what a guest asked for, if it is allowed for that guest's character. */
export function handleGuestCommand(slot: PlayerSlot, command: GuestCommand): void {
  const player = playerInSlot(slot);
  if (!isPlayer(player) || player.health.current <= 0) return;
  if (command.kind === 'buy') {
    const item = keeperNear(player)?.shopNpc?.items[command.index];
    if (item) buy(player, item);
    return;
  }
  const current: Loadout = { inventory: player.inventory ?? [], equipped: player.equipped ?? {} };
  const proposed: Loadout = { inventory: command.inventory.slice(0, MAX_INVENTORY), equipped: command.equipped };
  if (sameItems(current, proposed) && slotsFit(proposed.equipped)) applyLoadout(player, proposed);
}
