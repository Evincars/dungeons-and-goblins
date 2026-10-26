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
import { isEquipSlot, QUICK_SLOTS } from '../world';
import { BASE_SPRINT } from '../entities/PlayerFactory';
import { queueRestRequest, spendHitDice } from './Rest';
import { setDownItem } from '../entities/LootFactory';
import type { TextId } from '../core/texts';
import { queueAnswer } from './Party';
import { chooseLoot } from './LootRoll';
import { applyCustomization } from './Customize';
import { canBind } from '../rules/Spellbook';
import { canToggle } from '../rules/ClassFeatures';
import { heroClass } from '../rules/Classes';

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

/** Kilograms a player can carry, bag and worn gear together, without strain. */
export const MAX_CARRY_KG = 100;
/** A hero can strain under up to this share of that (115 kg); anything more and they are overloaded. */
const OVERLOAD_SHARE = 1.15;

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

/** Why an item can't go in the bag (no free square, or the hero would be overloaded); null when it can. */
export function bagRefusal(player: Player, item: InventoryItem): TextId | null {
  if (freeSquare(player.inventory ?? []) < 0) return 'roll.bag_full';
  return carriedWeight(player) + (item.weight ?? 0) > MAX_CARRY_KG * OVERLOAD_SHARE ? 'roll.overloaded' : null;
}

/** Puts an item in the first empty square, if there is one and it isn't too heavy to carry; returns whether it went in. */
export function addToBag(player: Player, item: InventoryItem): boolean {
  const inventory = player.inventory ?? (player.inventory = []);
  if (bagRefusal(player, item)) return false;
  inventory[freeSquare(inventory)] = item;
  return true;
}

/**
 * A find for this hero (taken from the floor, or from a chest or a kill): into the bag, said over their head, or —
 * a full bag, too much to carry — refused, and the hero says why. Returns whether they took it.
 */
export function receiveItem(player: Player, item: InventoryItem): boolean {
  const refusal = bagRefusal(player, item);
  const { x, y } = player.position;
  if (refusal) {
    logLine(player, text(refusal), 'miss');
    sound.playSound('fail', x, y);
    return false;
  }
  addToBag(player, structuredClone(item));
  logLine(player, text('roll.received', { item: item.name }), 'gold');
  sound.playSound('pickup', x, y);
  return true;
}

/** The inventory's "Drop": the item leaves the bag (or the body) and is set down at the hero's feet, to be taken again with E. */
export function dropItem(player: Player, from: ItemPlace): boolean {
  const loadout: Loadout = { inventory: [...(player.inventory ?? [])], equipped: { ...player.equipped } };
  const item = itemAt(loadout, from);
  if (!item) return false;
  if ('bag' in from) loadout.inventory[from.bag] = null;
  else delete loadout.equipped[from.slot];
  applyLoadout(player, { inventory: trimmed(loadout.inventory), equipped: loadout.equipped });
  setDownItem(player.position.x, player.position.y, item);
  return true;
}

/** The inventory's "Drop": at once here, or asked of the host for a guest. */
export function requestDrop(player: Player, from: ItemPlace): void {
  if (coop.role === 'guest') coop.sendCommand({ kind: 'drop', from });
  else dropItem(player, from);
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
  sound.playSound('pickup', receiver.position.x, receiver.position.y);
  return true;
}

/** The inventory's "Send to": at once here, or asked of the host for a guest. */
export function requestGive(player: Player, from: ItemPlace, to: PlayerSlot): void {
  if (coop.role === 'guest') coop.sendCommand({ kind: 'give', from, to });
  else giveItem(player, from, to);
}

/** Puts a spell, cast at a level, on a quick-bar square if the hero has learnt it and may cast it there. */
export function bindSpell(player: Player, slot: number, spell: string, level: number): boolean {
  const cls = heroClass(player.heroClass).dndClass;
  if (!Number.isInteger(slot) || slot < 0 || slot >= QUICK_SLOTS || !canBind(cls, player.playerStats.level, spell, level)) return false;
  const book = player.spellbook ?? (player.spellbook = { recovery: Array.from({ length: QUICK_SLOTS }, () => 0) });
  const bound = Array.from({ length: QUICK_SLOTS }, (_, i) => book.bound?.[i] ?? null);
  bound[slot] = { spell, level };
  book.bound = bound;
  book.recovery[slot] = 0;
  return true;
}

/** Switches a passive class feature off or on if the hero has it and the game plays it out. */
export function toggleFeature(player: Player, feature: string): boolean {
  if (!canToggle(player, feature)) return false;
  const off = player.featuresOff ?? [];
  player.featuresOff = off.includes(feature) ? off.filter((f) => f !== feature) : [...off, feature];
  return true;
}

/** The Skills tab's click on a passive: at once here, or asked of the host for a guest. */
export function requestToggleFeature(player: Player, feature: string): void {
  if (coop.role === 'guest') coop.sendCommand({ kind: 'toggle_feature', feature });
  else toggleFeature(player, feature);
}

/** The quick bar: bound at once here, or asked of the host for a guest (whose copy the host's next update corrects if refused). */
export function requestBind(player: Player, slot: number, spell: string, level: number): void {
  if (coop.role === 'guest') coop.sendCommand({ kind: 'bind_spell', slot, spell, level });
  else bindSpell(player, slot, spell, level);
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
  if (command.kind === 'rest_dice') {
    spendHitDice(player, command.count);
    return;
  }
  if (command.kind === 'drop') {
    dropItem(player, command.from);
    return;
  }
  if (command.kind === 'scores' || command.kind === 'fighting_style' || command.kind === 'improve' || command.kind === 'lock_build') {
    applyCustomization(player, command);
    return;
  }
  if (command.kind === 'rest') return queueRestRequest(slot, command.rest, command.dice);
  if (command.kind === 'toggle_feature') {
    toggleFeature(player, command.feature);
    return;
  }
  if (command.kind === 'bind_spell') {
    bindSpell(player, command.slot, command.spell, command.level);
    return;
  }
  if (command.kind === 'give') {
    giveItem(player, command.from, command.to);
    return;
  }
  const current: Loadout = { inventory: player.inventory ?? [], equipped: player.equipped ?? {} };
  const proposed: Loadout = { inventory: command.inventory.slice(0, MAX_INVENTORY), equipped: command.equipped };
  if (sameItems(current, proposed) && slotsFit(proposed.equipped)) applyLoadout(player, proposed);
}
