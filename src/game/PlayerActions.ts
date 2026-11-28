import { q, isActivePlayer, isPlayer } from '../world';
import { THROWABLES, isThrowableId } from '../rules/Throwables';
import { quaff, throwItem } from '../systems/ThrowSystem';
import { heroHeld } from '../systems/SpellHolds';
import { bindingActionId, weaponsWithAction } from '../rules/WeaponActions';
import type { WeaponActionId } from '../rules/WeaponActions';
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
import { queueRestRequest } from './Rest';
import { setDownItem } from '../entities/LootFactory';
import type { TextId } from '../core/texts';
import { queueAnswer } from './Party';
import { setSeatPaused } from './Pause';
import { chooseLoot } from './LootRoll';
import { applyCustomization, isCustomizeCommand } from './Customize';
import { EMPTY_SQUARE, UNBOUND, canBind, featSpellBindable, roomToBind, spellListOf } from '../rules/Spellbook';
import type { QuickBinding } from '../rules/Spellbook';
import type { DamageType } from '../rules/DamageTypes';
import { validChoice } from '../rules/DamageChoice';
import { bindingFeatureId, canToggle, hasClassFeature } from '../rules/ClassFeatures';
import { FEATS, bindingFeatId } from '../rules/Feats';
import type { FeatId } from '../rules/Feats';
import { passiveFeats } from '../rules/Build';
import { heroClass, weaponProficient } from '../rules/Classes';
import { chooseDeparture } from '../systems/ExitSystem';
import { characterSheet } from '../rules/CharacterSheet';
import { endMageArmour } from '../systems/LastingSpells';
import { needsBothHands, strengthNeeded, strongEnough } from '../rules/Equipment';
import { MAX_CARRY_KG as CARRY_KG } from '../rules/Encumbrance';
import { validVariant } from '../rules/SpellVariants';
import type { SpellVariant } from '../rules/SpellVariants';

/**
 * What players do from the shop and inventory panels. In a lone game or on the host it happens at once;
 * a guest's screen only asks, and the host checks the request and carries it out for that character
 * (the host owns the world, so a guest changing its own copy would be undone by the next update).
 */

/** The bag is a grid of this many squares across and down (the inventory shows a few rows at a time and scrolls); one item per square. */
export const INVENTORY_COLS = 6;
export const INVENTORY_ROWS = 20;
export const MAX_INVENTORY = INVENTORY_COLS * INVENTORY_ROWS;
/** Sword tier (how far a swing reaches) with nothing equipped; each point of strength on gear adds one. */
const BASE_SWORD_TIER = 1;
/** What each point of a stat on worn gear gives besides its ability score: ticks of sprint (Constitution) and a share more coins (Charisma). */
const SPRINT_PER_CONSTITUTION = 10;
const LOOT_PER_CHARISMA = 0.05;

export type Loadout = { inventory: BagSquare[]; equipped: Partial<Record<EquipSlot, InventoryItem>> };

/** A square of the inventory screen: one in the bag's grid, or an equipment slot. */
export type ItemPlace = ItemSquare;

/** Kilograms a player can carry, bag and worn gear together, without strain (past 80 % of it they slow, rules/Encumbrance.ts). */
export const MAX_CARRY_KG = CARRY_KG;
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

/** The item on a square of the bag (or worn) taken out of the hero's hands, if there is one there. */
function takeOut(player: Player, from: ItemPlace): InventoryItem | null {
  const loadout: Loadout = { inventory: [...(player.inventory ?? [])], equipped: { ...player.equipped } };
  const item = itemAt(loadout, from);
  if (!item) return null;
  if ('bag' in from) loadout.inventory[from.bag] = null;
  else delete loadout.equipped[from.slot];
  applyLoadout(player, { inventory: trimmed(loadout.inventory), equipped: loadout.equipped });
  return item;
}

/** The inventory's "Drop": the item leaves the bag (or the body) and is set down at the hero's feet, to be taken again with E. */
export function dropItem(player: Player, from: ItemPlace): boolean {
  const item = takeOut(player, from);
  if (!item) return false;
  setDownItem(player.position.x, player.position.y, item);
  return true;
}

/** Whether the hero can throw or drink now: on their feet, not held by a spell, their arm free of a swing or a throw. */
function handsFree(player: Player): boolean {
  return isActivePlayer(player) && !heroHeld(player) && (player.attackCooldown ?? 0) <= 0;
}

/**
 * The inventory's "Throw", aimed in the world (game/ThrowAim.ts): the item leaves the hero's hands towards (x, y), as far as
 * it can be thrown (systems/ThrowSystem.ts). Not while the hero cannot throw. Returns whether it flew.
 */
export function throwFromBag(player: Player, from: ItemPlace, x: number, y: number): boolean {
  if (!handsFree(player)) return false;
  const item = takeOut(player, from);
  if (!item) return false;
  throwItem(player, item, x, y);
  return true;
}

/** The inventory's "Drink": a potion of healing heals the hero who drinks it, and is gone. Returns whether it was drunk. */
export function drinkPotion(player: Player, from: ItemPlace): boolean {
  const kind = itemAt({ inventory: player.inventory ?? [], equipped: player.equipped ?? {} }, from)?.kind;
  if (!isThrowableId(kind) || !THROWABLES[kind].heal || !handsFree(player)) return false;
  if (!takeOut(player, from)) return false;
  logLine(player, text('roll.drinks', { item: THROWABLES[kind].name }), 'heal');
  sound.playSound('cast_healing_word', player.position.x, player.position.y);
  quaff(player, THROWABLES[kind]);
  return true;
}

/** "Throw" aimed: at once here, or asked of the host for a guest. */
export function requestThrow(player: Player, from: ItemPlace, x: number, y: number): void {
  if (coop.role === 'guest') coop.sendCommand({ kind: 'throw', from, x, y });
  else throwFromBag(player, from, x, y);
}

/** "Drink": at once here, or asked of the host for a guest. */
export function requestDrink(player: Player, from: ItemPlace): void {
  if (coop.role === 'guest') coop.sendCommand({ kind: 'drink', from });
  else drinkPotion(player, from);
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

/**
 * Why a new arrangement of the worn gear can't be: a weapon that needs both hands with something in the other hand, or
 * armour put on by a hero without the STR it asks for (src/data/armors.json `strength`); null when it can. Only what is
 * newly put on is held to the STR it asks, so a hero who has grown weaker can still take theirs off and move things round it.
 */
export function wearRefusal(before: Loadout['equipped'], after: Loadout['equipped'], strength: number): string | null {
  const { primary, secondary } = after;
  if ((needsBothHands(primary) && secondary) || (needsBothHands(secondary) && primary)) {
    return text('roll.both_hands', { item: (needsBothHands(primary) ? primary : secondary)?.name ?? '' });
  }
  const worn = new Set(Object.values(before).flatMap((item) => (item ? [itemKey(item)] : [])));
  const weak = Object.values(after).find((item) => item && !worn.has(itemKey(item)) && !strongEnough(item, strength));
  return weak ? text('roll.too_weak', { item: weak.name, score: strengthNeeded(weak) }) : null;
}

/** A hero's STR score, gear and all. */
function strengthOf(player: Player): number {
  return characterSheet(player).scores.strength;
}

/**
 * The inventory screen's move (a drag, a double-click) for this hero: the new arrangement, or null when it is not allowed
 * (it doesn't fit, or wearRefusal: then the hero says why).
 */
export function moveWorn(player: Player, from: ItemPlace, to: ItemPlace): Loadout | null {
  const loadout: Loadout = { inventory: player.inventory ?? [], equipped: player.equipped ?? {} };
  const next = moveItem(loadout, from, to);
  if (!next) return null;
  const refusal = wearRefusal(loadout.equipped, next.equipped, strengthOf(player));
  if (!refusal) return next;
  logLine(player, refusal, 'miss');
  sound.playSound('fail', player.position.x, player.position.y);
  return null;
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

/** A trader pays this share of an item's price for it (as in the tabletop game: half). */
export const SELL_SHARE = 0.5;
/** A trader keeps at most this many things heroes sold it, for them to buy back; the oldest goes for a new one. */
export const MAX_RESALE = 32;

/** What a trader pays for an item: its share of the price, at least a gold piece. */
export function sellPrice(item: InventoryItem): number {
  return Math.max(1, Math.floor(item.value * SELL_SHARE));
}

/** Everything a trader offers, in the order its panel lists it: its wares, then what heroes sold it. */
export function shopWares(keeper: Entity): InventoryItem[] {
  const shop = keeper.shopNpc;
  return shop ? [...shop.items, ...(shop.resale ?? [])] : [];
}

/**
 * Buys the trader's offer at `index` (of shopWares): a ware is never sold out, a thing a hero sold it goes back once
 * bought. Returns whether the hero got it.
 */
export function buyFrom(player: Player, keeper: Entity, index: number): boolean {
  const shop = keeper.shopNpc;
  const item = shop ? shopWares(keeper)[index] : undefined;
  if (!shop || !item || !buy(player, item)) return false;
  if (shop.gold !== undefined) shop.gold += item.value;
  const resaleAt = index - shop.items.length;
  if (resaleAt >= 0) shop.resale?.splice(resaleAt, 1);
  return true;
}

/**
 * Sells the item on a square of the hero's bag to the trader: it pays sellPrice (if it has the gold), and keeps the item
 * for buying back.
 */
export function sell(player: Player, keeper: Entity, index: number): boolean {
  const shop = keeper.shopNpc;
  const inventory = player.inventory;
  const item = inventory?.[index];
  if (!shop || !inventory || !item) return false;
  const price = sellPrice(item);
  if (shop.gold !== undefined && shop.gold < price) {
    sound.playSound('fail', player.position.x, player.position.y);
    return false;
  }
  inventory[index] = null;
  player.playerStats.gold += price;
  if (shop.gold !== undefined) shop.gold -= price;
  const resale = shop.resale ?? (shop.resale = []);
  resale.push(item);
  if (resale.length > MAX_RESALE) resale.shift();
  sound.playSound('buy', player.position.x, player.position.y);
  return true;
}

/** Buying from the trade panel: at once here (from the trader in reach), or through the host for a guest. */
export function requestBuy(player: Player, index: number): void {
  if (coop.role === 'guest') {
    coop.sendCommand({ kind: 'buy', index });
    return;
  }
  const keeper = keeperNear(player);
  if (keeper) buyFrom(player, keeper, index);
}

/** Selling a bag square's item from the trade panel: at once here, or through the host for a guest. */
export function requestSell(player: Player, index: number): void {
  if (coop.role === 'guest') {
    coop.sendCommand({ kind: 'sell', index });
    return;
  }
  const keeper = keeperNear(player);
  if (keeper) sell(player, keeper, index);
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
  // Mage Armour works only without body armour: putting some on ends it.
  if ((player.buffs?.mageArmor ?? 0) > 0 && characterSheet(player).armorClass.armor) endMageArmour(player);
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

/** Spells are prepared — put on the quick bar — only in a safe room, as a caster prepares them after a rest. */
export function preparesSpells(player: Player): boolean {
  return !!player.inSafeRoom;
}

/** Whether this may go on the quick bar now: a spell only in a safe room, a class feature or a Passive Feat anywhere. */
export function mayPrepare(player: Player, spell: string): boolean {
  return bindingFeatureId(spell) !== null || bindingFeatId(spell) !== null || bindingActionId(spell) !== null || preparesSpells(player);
}

/** A Passive Feat the hero has that is switched or used from the quick bar (Great Weapon Master, Charger) may be bound; at level 0. */
function featBindable(player: Player, feat: FeatId, level: number): boolean {
  const cls = heroClass(player.heroClass);
  const kind = FEATS[feat].passive;
  return level === 0 && (kind === 'toggle' || kind === 'active') && passiveFeats(cls, player.playerStats.level, player.build).includes(feat);
}

/**
 * A weapon action may be bound (at level 0) by a hero proficient with a weapon that unlocks it, whatever they hold now: it is
 * used only with that weapon in the main hand (systems/WeaponActions.ts).
 */
function actionBindable(player: Player, id: WeaponActionId, level: number): boolean {
  if (level !== 0) return false;
  const sheet = characterSheet(player);
  const cls = heroClass(player.heroClass);
  return weaponsWithAction(id).some((base) => weaponProficient(cls, base, sheet.feats.weapons));
}

/**
 * Puts a spell, cast at a level (and, for a spell whose caster picks its damage, of the type chosen), on a quick-bar square
 * if the hero has learnt it, may cast it there and is in a safe room.
 */
export function bindSpell(player: Player, slot: number, spell: string, level: number, damageType?: DamageType, variant?: SpellVariant): boolean {
  if (!validChoice(spell, damageType) || !validVariant(spell, variant)) return false;
  const list = spellListOf(heroClass(player.heroClass).dndClass, player.build);
  if (!Number.isInteger(slot) || slot < 0 || slot >= QUICK_SLOTS || !mayPrepare(player, spell)) return false;
  const feat = bindingFeatId(spell);
  const action = bindingActionId(spell);
  const allowed = action ? actionBindable(player, action, level) : feat ? featBindable(player, feat, level)
    : canBind(list, player.playerStats.level, spell, level, player.build?.spells) || featSpellBindable(player, spell, level);
  if (!allowed) return false;
  const feature = bindingFeatureId(spell);
  if (feature !== null && !hasClassFeature(player, feature)) return false;
  // A wizard keeps only so many cantrips and spells of each level on the bar.
  if (!roomToBind(player, spell, level, slot)) return false;
  putOnSquare(player, slot, { spell, level, ...(damageType ? { damageType } : {}), ...(variant ? { variant } : {}) });
  return true;
}

/** What a square holds from now on, its recovery started afresh. */
function putOnSquare(player: Player, slot: number, binding: QuickBinding): void {
  const book = player.spellbook ?? (player.spellbook = { recovery: Array.from({ length: QUICK_SLOTS }, () => 0) });
  const bound = Array.from({ length: QUICK_SLOTS }, (_, i) => book.bound?.[i] ?? null);
  bound[slot] = binding;
  book.bound = bound;
  book.recovery[slot] = 0;
}

/**
 * Empties a quick-bar square (a right click on it): it holds nothing from now on, not even the class's own spell, until
 * something is bound there again. Allowed anywhere, unlike binding a spell. Returns whether the square was a real one.
 */
export function unbindSpell(player: Player, slot: number): boolean {
  if (!Number.isInteger(slot) || slot < 0 || slot >= QUICK_SLOTS) return false;
  putOnSquare(player, slot, EMPTY_SQUARE);
  return true;
}

/**
 * A preset put on the quick bar (game/profile/QuickBarProfile.ts), in a safe room only: every square is emptied, then
 * takes what the preset holds there if the hero may still bind it (a spell they no longer know, or a wizard's level
 * already full, leaves it empty); a square the preset left to the class gets the class's own again. Returns whether it
 * was loaded.
 */
export function loadBindings(player: Player, bound: readonly (QuickBinding | null)[]): boolean {
  if (!preparesSpells(player) || bound.length !== QUICK_SLOTS) return false;
  const book = player.spellbook ?? (player.spellbook = { recovery: Array.from({ length: QUICK_SLOTS }, () => 0) });
  book.bound = Array.from({ length: QUICK_SLOTS }, () => EMPTY_SQUARE);
  bound.forEach((binding, slot) => {
    if (binding && binding.spell !== UNBOUND) bindSpell(player, slot, binding.spell, binding.level, binding.damageType, binding.variant);
  });
  const loaded = book.bound;
  book.bound = loaded.map((binding, slot) => (bound[slot] === null ? null : binding));
  book.recovery.fill(0);
  return true;
}

/** A preset loaded from the inventory: at once here, or asked of the host for a guest. */
export function requestLoadBindings(player: Player, bound: readonly (QuickBinding | null)[]): void {
  if (coop.role === 'guest') coop.sendCommand({ kind: 'load_bindings', bound: [...bound] });
  else loadBindings(player, bound);
}

/** A right click on a quick-bar square: emptied here at once, or asked of the host for a guest. */
export function requestUnbind(player: Player, slot: number): void {
  if (coop.role === 'guest') coop.sendCommand({ kind: 'unbind_spell', slot });
  else unbindSpell(player, slot);
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
export function requestBind(player: Player, slot: number, spell: string, level: number, damageType?: DamageType, variant?: SpellVariant): void {
  if (coop.role === 'guest') coop.sendCommand({ kind: 'bind_spell', slot, spell, level, ...(damageType ? { damageType } : {}), ...(variant ? { variant } : {}) });
  else bindSpell(player, slot, spell, level, damageType, variant);
}

/** Host: carries out what a guest asked for, if it is allowed for that guest's character. */
export function handleGuestCommand(slot: PlayerSlot, command: GuestCommand): void {
  // Answers by seat: whether that seat's hero may still answer is looked at where they are counted.
  if (command.kind === 'vote_answer') return queueAnswer(slot, command.agree, command.dice);
  if (command.kind === 'pause') return setSeatPaused(slot, command.paused);
  if (command.kind === 'loot') return chooseLoot(slot, command.roll, command.need);
  if (command.kind === 'depart') return chooseDeparture(slot, command.choice);
  const player = playerInSlot(slot);
  if (!isPlayer(player) || player.health.current <= 0) return;
  if (command.kind === 'buy' || command.kind === 'sell') {
    const keeper = keeperNear(player);
    if (keeper && command.kind === 'buy') buyFrom(player, keeper, command.index);
    else if (keeper) sell(player, keeper, command.index);
    return;
  }
  if (command.kind === 'drop') {
    dropItem(player, command.from);
    return;
  }
  if (command.kind === 'throw') {
    throwFromBag(player, command.from, command.x, command.y);
    return;
  }
  if (command.kind === 'drink') {
    drinkPotion(player, command.from);
    return;
  }
  if (isCustomizeCommand(command)) {
    applyCustomization(player, command);
    return;
  }
  if (command.kind === 'rest') return queueRestRequest(slot, command.rest, command.dice);
  if (command.kind === 'toggle_feature') {
    toggleFeature(player, command.feature);
    return;
  }
  if (command.kind === 'bind_spell') {
    bindSpell(player, command.slot, command.spell, command.level, command.damageType, command.variant);
    return;
  }
  if (command.kind === 'unbind_spell') {
    unbindSpell(player, command.slot);
    return;
  }
  if (command.kind === 'load_bindings') {
    loadBindings(player, command.bound);
    return;
  }
  if (command.kind === 'give') {
    giveItem(player, command.from, command.to);
    return;
  }
  const current: Loadout = { inventory: player.inventory ?? [], equipped: player.equipped ?? {} };
  const proposed: Loadout = { inventory: command.inventory.slice(0, MAX_INVENTORY), equipped: command.equipped };
  const wearable = wearRefusal(current.equipped, proposed.equipped, strengthOf(player)) === null;
  if (sameItems(current, proposed) && slotsFit(proposed.equipped) && wearable) applyLoadout(player, proposed);
}
