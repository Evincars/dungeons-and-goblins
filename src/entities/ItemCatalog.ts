import { isGearKind, isItemType, isStatName } from '../world';
import type { InventoryItem, ItemStats } from '../world';
import { isRecord } from '../core/guards';
import weapons from '../data/weapons.json';
import shields from '../data/shields.json';
import armors from '../data/armors.json';
import medals from '../data/medals.json';

/**
 * Every weapon, shield, suit of armour and medal the game knows, read from the JSON files in src/data (tune names,
 * values and stats there). Entries that don't hold together are left out rather than half-used.
 */

function readStats(raw: unknown): ItemStats | undefined {
  if (!isRecord(raw)) return undefined;
  const stats: ItemStats = {};
  for (const [key, value] of Object.entries(raw)) {
    if (isStatName(key) && typeof value === 'number') stats[key] = value;
  }
  return stats;
}

/** One catalogue entry as an item, or null when it is missing a part. */
function readItem(raw: unknown): InventoryItem | null {
  if (!isRecord(raw) || !isItemType(raw.type) || typeof raw.name !== 'string' || typeof raw.cost !== 'number') return null;
  if (typeof raw.id !== 'string' || typeof raw.icon !== 'string' || (raw.gear !== undefined && !isGearKind(raw.gear))) return null;
  // `cost` (the price in gold) is what the game calls an item's value.
  const item: InventoryItem = { id: raw.id, type: raw.type, name: raw.name, value: raw.cost, icon: raw.icon, stats: readStats(raw.stats) };
  if (typeof raw.weight === 'number') item.weight = raw.weight;
  if (isGearKind(raw.gear)) item.gear = raw.gear;
  if (typeof raw.kind === 'string') item.kind = raw.kind;
  return item;
}

function readAll(file: { items: readonly unknown[] }): InventoryItem[] {
  return file.items.flatMap((raw) => readItem(raw) ?? []);
}

export const WEAPONS: readonly InventoryItem[] = readAll(weapons);
export const SHIELDS: readonly InventoryItem[] = readAll(shields);
export const ARMORS: readonly InventoryItem[] = readAll(armors);
export const MEDALS: readonly InventoryItem[] = readAll(medals);

/** Weapons to fight with (not shields). */
export const HAND_WEAPONS: readonly InventoryItem[] = WEAPONS.filter((item) => item.gear === 'weapon');

/** Where each catalogue icon's art lives (every entry names its own file). */
export function catalogIconSources(): Array<{ key: string; src: string }> {
  return [...weapons.items, ...shields.items, ...armors.items, ...medals.items].flatMap((raw: unknown) =>
    (isRecord(raw) && typeof raw.src === 'string' && typeof raw.icon === 'string' ? [{ key: raw.icon, src: raw.src }] : []));
}

/** A fresh copy of a random entry, for loot and starting gear. */
export function randomItem(from: readonly InventoryItem[]): InventoryItem {
  const item = from[Math.floor(Math.random() * from.length)];
  return structuredClone(item);
}
