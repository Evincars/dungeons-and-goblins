import { q, isPlayer } from '../world';
import type { EquipSlot, Entity, InventoryItem, Player, PlayerSlot } from '../world';
import { sound } from '../audio/SoundPlayer';
import { coop } from '../network/CoopSession';
import type { GuestCommand } from '../network/protocol';
import { nearby, Sense } from '../ai/perception/spatial';
import { REACH } from '../systems/TargetSystem';

/**
 * What players do from the shop and inventory panels. In a lone game or on the host it happens at once;
 * a guest's screen only asks, and the host checks the request and carries it out for that character
 * (the host owns the world, so a guest changing its own copy would be undone by the next update).
 */

export const MAX_INVENTORY = 8;
/** Sword tier with nothing equipped; each point of attack on equipment adds one. */
const BASE_SWORD_TIER = 1;

type Loadout = { inventory: InventoryItem[]; equipped: Partial<Record<EquipSlot, InventoryItem>> };

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

/** Puts the bag and equipment in the given arrangement and works out the bonuses they give. */
export function applyLoadout(player: Player, loadout: Loadout): void {
  player.inventory = loadout.inventory;
  player.equipped = loadout.equipped;
  let attack = 0;
  let defense = 0;
  for (const item of Object.values(loadout.equipped)) {
    attack += item?.stats?.attack ?? 0;
    defense += item?.stats?.defense ?? 0;
  }
  player.playerStats.swordTier = BASE_SWORD_TIER + attack;
  player.playerStats.armorTier = defense;
}

/** Rearranging the inventory panel: shown at once, and for a guest also sent to the host to make it real. */
export function requestLoadout(player: Player, loadout: Loadout): void {
  applyLoadout(player, loadout);
  if (coop.role === 'guest') coop.sendCommand({ kind: 'loadout', ...loadout });
}

const itemKey = (item: InventoryItem): string => JSON.stringify([item.type, item.name, item.value, item.slot, item.icon, item.stats]);

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

/** Equipment goes in its own slot only: a helmet cannot be worn as boots. */
function slotsFit(equipped: Loadout['equipped']): boolean {
  return Object.entries(equipped).every(([slot, item]) => !item || item.slot === slot);
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
