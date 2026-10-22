import { STAT_NAMES } from '../world';
import type { EquipSlot, GearKind, InventoryItem, StatName } from '../world';

/** How the inventory screen names each equipment slot. */
export const SLOT_LABELS = {
  head: 'Head',
  armor: 'Armor',
  primary: 'Primary weapon',
  secondary: 'Secondary weapon',
  legs: 'Legs',
  other1: 'Other 1',
  other2: 'Other 2',
} as const satisfies Record<EquipSlot, string>;

/** How the inventory screen names each stat. */
export const STAT_LABELS = {
  strength: 'Strength',
  intelligence: 'Intelligence',
  stamina: 'Stamina',
  defence: 'Defence',
  luck: 'Luck',
  mana: 'Mana',
} as const satisfies Record<StatName, string>;

/** The kinds of gear each slot takes: a weapon in either hand, a shield in the second, trinkets in both "other" slots. */
const SLOT_GEAR = {
  head: ['head'],
  armor: ['armor'],
  primary: ['weapon'],
  secondary: ['weapon', 'offhand'],
  legs: ['legs'],
  other1: ['trinket'],
  other2: ['trinket'],
} as const satisfies Record<EquipSlot, readonly GearKind[]>;

/** Whether an item can go in an equipment slot. */
export function fitsSlot(item: InventoryItem, slot: EquipSlot): boolean {
  const kinds: readonly GearKind[] = SLOT_GEAR[slot];
  return item.gear !== undefined && kinds.includes(item.gear);
}

/** What the worn gear adds up to, stat by stat (every stat starts at 0). */
export function statTotals(equipped: Partial<Record<EquipSlot, InventoryItem>>): Record<StatName, number> {
  const totals = { strength: 0, intelligence: 0, stamina: 0, defence: 0, luck: 0, mana: 0 } satisfies Record<StatName, number>;
  for (const item of Object.values(equipped)) {
    for (const stat of STAT_NAMES) totals[stat] += item?.stats?.[stat] ?? 0;
  }
  return totals;
}

/**
 * Item pictures, by `InventoryItem.icon`: weapons and shields from the supplies sheet, armour busts from the
 * wall decor, and the two drawn at load time (there is no boot or ring art).
 */
export const ITEM_ICONS = [
  'item_arms_00', // 0 sword
  'item_arms_11', // 1 long sword
  'prop_armor_bust2', // 2 helm
  'prop_armor_bust', // 3 mail
  'icon_boots', // 4 boots
  'icon_ring', // 5 ring
  'item_arms_08', // 6 round wooden shield
  'item_arms_13', // 7 axe
  'item_arms_04', // 8 dagger
  'item_arms_30', // 9 kite shield
] as const;

/** The texture key of an item's picture (a plain sword when it has none). */
export function itemIcon(item: InventoryItem): string {
  return ITEM_ICONS[item.icon ?? 0] ?? ITEM_ICONS[0];
}
