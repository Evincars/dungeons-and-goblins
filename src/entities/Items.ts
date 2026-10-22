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
  ammo: 'Arrows',
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
  ammo: ['ammo'],
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

/** The picture shown for an item without one of its own. */
const FALLBACK_ICON = 'item_arms_00';

/** The texture key of an item's picture. */
export function itemIcon(item: InventoryItem): string {
  return item.icon ?? FALLBACK_ICON;
}
