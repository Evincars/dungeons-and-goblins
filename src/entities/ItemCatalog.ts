import { isGearKind, isItemType, isStatName } from '../world';
import type { InventoryItem, ItemStats } from '../world';
import type { Rect } from '../assets/SpriteSheet';
import { isRecord } from '../core/guards';
import { isItemBase, isMagicBonus } from '../rules/Equipment';
import weapons from '../data/weapons.json';
import shields from '../data/shields.json';
import armors from '../data/armors.json';
import medals from '../data/medals.json';

/**
 * Every weapon, shield, suit of armour and medal the game knows, read from the JSON files in src/data (tune names,
 * values and stats there). Entries that don't hold together are left out rather than half-used.
 */

/**
 * The game's coins are gold only: a price under a gold piece (a dart's 5 cp, a quarterstaff's 2 sp) is paid as a whole
 * gold piece, any other rounded up to the next.
 */
const priceInGold = (cost: number): number => Math.ceil(cost);

/** The armour's art: a sheet of 32 px suits, one column per kind; its first rows are the same suits in other colours. */
export const ARMOR_SHEET = '/armors.png';
const ARMOR_ICON = 32;
/** How many colours each suit comes in (the sheet's first rows), and how many columns of suits it has. */
export const ARMOR_COLOURS = 4;
const ARMOR_COLUMNS = 16;

/** A suit's column in the armour sheet (1 at the left), if a catalogue entry names one. */
function armorColumn(raw: Record<string, unknown>): number | null {
  const column = raw.column;
  return typeof column === 'number' && Number.isInteger(column) && column >= 1 && column <= ARMOR_COLUMNS ? column : null;
}

/** The icon keys of an icon's colours: `<icon>_1`…`<icon>_4`. */
function colourKeys(icon: string): string[] {
  return Array.from({ length: ARMOR_COLOURS }, (_, k) => `${icon}_${k + 1}`);
}

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
  // `cost` (the price in gold) is what the game calls an item's value. A suit of armour shows its first colour.
  const icon = armorColumn(raw) === null ? raw.icon : colourKeys(raw.icon)[0];
  const item: InventoryItem = { id: raw.id, type: raw.type, name: raw.name, value: priceInGold(raw.cost), icon, stats: readStats(raw.stats) };
  if (typeof raw.weight === 'number') item.weight = raw.weight;
  if (isGearKind(raw.gear)) item.gear = raw.gear;
  if (typeof raw.kind === 'string') item.kind = raw.kind;
  if (isItemBase(raw.base)) item.base = raw.base;
  if (isMagicBonus(raw.bonus) && raw.bonus > 0) item.bonus = raw.bonus;
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

/** The colours each coloured catalogue entry (a suit of armour) comes in, by its id. */
const COLOURS: ReadonlyMap<string, readonly string[]> = new Map(armors.items.flatMap((raw: unknown) => {
  if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.icon !== 'string' || armorColumn(raw) === null) return [];
  return [[raw.id, colourKeys(raw.icon)] as const];
}));

/** Where each colour of each suit of armour lies in the armour sheet (its column, the colour's row), by icon key. */
export function armorIconRegions(): Record<string, Rect> {
  const regions: Record<string, Rect> = {};
  for (const raw of armors.items) {
    if (!isRecord(raw) || typeof raw.icon !== 'string') continue;
    const column = armorColumn(raw);
    if (column === null) continue;
    colourKeys(raw.icon).forEach((key, row) => { regions[key] = { x: (column - 1) * ARMOR_ICON, y: row * ARMOR_ICON, w: ARMOR_ICON, h: ARMOR_ICON }; });
  }
  return regions;
}

/** A fresh copy of a catalogue entry to hand out: a suit of armour in one of its colours, picked at random. */
export function freshCopy(item: InventoryItem): InventoryItem {
  const copy = structuredClone(item);
  const colours = item.id === undefined ? undefined : COLOURS.get(item.id);
  if (colours) copy.icon = colours[Math.floor(Math.random() * colours.length)];
  return copy;
}

/** A fresh copy of a random entry, for loot and starting gear. */
export function randomItem(from: readonly InventoryItem[]): InventoryItem {
  return freshCopy(from[Math.floor(Math.random() * from.length)]);
}
