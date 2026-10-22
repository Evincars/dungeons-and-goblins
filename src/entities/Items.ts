import { EQUIP_SLOTS, STAT_NAMES } from '../world';
import { text } from '../core/texts';
import type { EquipSlot, GearKind, InventoryItem, StatName } from '../world';

/** How the inventory screen names an equipment slot. */
export function slotLabel(slot: EquipSlot): string {
  return text(`slot.${slot}` as const);
}

/** A stat's three-letter form (STR), its full name (Strength) and what it does. */
export function statShort(stat: StatName): string {
  return text(`stat.${stat}.short` as const);
}

export function statName(stat: StatName): string {
  return text(`stat.${stat}.name` as const);
}

export function statDescription(stat: StatName): string {
  return text(`stat.${stat}.description` as const);
}

/** The kinds of gear each slot takes: a weapon in either hand, a shield in the second, trinkets in both "other" slots. */
const SLOT_GEAR = {
  head: ['head'],
  armor: ['armor'],
  primary: ['weapon'],
  secondary: ['weapon', 'offhand'],
  legs: ['legs'],
  medal: ['medal'],
  other: ['trinket'],
} as const satisfies Record<EquipSlot, readonly GearKind[]>;

/** Whether an item can go in an equipment slot. */
export function fitsSlot(item: InventoryItem, slot: EquipSlot): boolean {
  const kinds: readonly GearKind[] = SLOT_GEAR[slot];
  return item.gear !== undefined && kinds.includes(item.gear);
}

/**
 * The slot an item goes to when put on: dropped on the gear panel, the first that fits and is free (else the
 * first that fits); double-clicked (`replace`), always the first that fits, swapping out what is worn there.
 */
export function slotFor(equipped: Partial<Record<EquipSlot, InventoryItem>>, item: InventoryItem, replace = false): EquipSlot | null {
  const fitting = EQUIP_SLOTS.filter((slot) => fitsSlot(item, slot));
  if (replace) return fitting[0] ?? null;
  return fitting.find((slot) => !equipped[slot]) ?? fitting[0] ?? null;
}

/** What the worn gear adds up to, stat by stat (every stat starts at 0). */
export function statTotals(equipped: Partial<Record<EquipSlot, InventoryItem>>): Record<StatName, number> {
  const totals = { strength: 0, dexterity: 0, constitution: 0, intelligence: 0, wisdom: 0, charisma: 0 } satisfies Record<StatName, number>;
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
