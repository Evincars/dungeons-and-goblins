import { isGearKind, isItemType, isStatName } from '../world';
import type { InventoryItem, ItemStats } from '../world';
import type { Rect } from '../assets/SpriteSheet';
import { ensure } from '../core/errors';
import { isRecord } from '../core/guards';
import { isItemBase, isMagicBonus } from '../rules/Equipment';
import { WEAPON_BASES, weaponStats } from '../rules/WeaponTable';
import { ARMOR_BASES, armorStats } from '../rules/ArmorTable';
import type { ArmorBase } from '../rules/ArmorTable';
import medals from '../data/medals.json';

/**
 * Every weapon, shield, suit of armour and medal the game knows. Weapons, shields and armour are made from the rules'
 * tables (src/data/weapons.json and armors.json: a weapon or shield for each of its pictures, a suit for each armour with
 * a column of the armour sheet), with the table's name, price and weight, and no magic or ability stats. Medals are read
 * from src/data/medals.json; entries that don't hold together are left out rather than half-used.
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

/** The icon keys of an icon's colours: `<icon>_1`…`<icon>_4`. */
function colourKeys(icon: string): string[] {
  return Array.from({ length: ARMOR_COLOURS }, (_, k) => `${icon}_${k + 1}`);
}

/** A picture's number in its list, as ids and icon keys write it: 001, 002… */
const numbered = (i: number): string => String(i + 1).padStart(3, '0');

/** Every weapon of the table with pictures: one item for each picture. */
function weaponItems(): InventoryItem[] {
  return WEAPON_BASES.flatMap((base) => {
    if (base === 'unarmed') return [];
    const rule = weaponStats(base);
    return rule.art.map((_, i) => {
      const id = `weapon_${base}_${numbered(i)}`;
      return { id, type: 'weapon', gear: 'weapon', name: rule.name, value: priceInGold(rule.cost), weight: rule.weight, icon: id, base, kind: base, stats: {} } satisfies InventoryItem;
    });
  });
}

/** Shields (armour of the shield category): one item for each picture. */
function shieldItems(): InventoryItem[] {
  return ARMOR_BASES.flatMap((base) => {
    const rule = armorStats(base);
    if (rule.category !== 'shield') return [];
    return rule.art.map((_, i) => {
      const id = `${base}_${numbered(i)}`;
      return { id, type: 'shield', gear: 'offhand', name: rule.name, value: priceInGold(rule.cost), weight: rule.weight, icon: id, base, kind: base, stats: {} } satisfies InventoryItem;
    });
  });
}

/** The column of the armour sheet an armour is drawn from, if it is body armour that has one. */
function armorColumn(base: ArmorBase): number | null {
  const rule = armorStats(base);
  if (rule.category === 'shield' || rule.column === null) return null;
  ensure(Number.isInteger(rule.column) && rule.column >= 1 && rule.column <= ARMOR_COLUMNS, `Bad column for armour ${base}`, { base });
  return rule.column;
}

/** Body armour (and clothes): one suit of each, shown in its first colour. */
function armorItems(): InventoryItem[] {
  return ARMOR_BASES.flatMap((base) => {
    if (armorColumn(base) === null) return [];
    const rule = armorStats(base);
    const id = `armor_${base}`;
    return [{ id, type: 'armor', gear: 'armor', name: rule.name, value: priceInGold(rule.cost), weight: rule.weight, icon: colourKeys(id)[0], base, kind: base, stats: {} } satisfies InventoryItem];
  });
}

function readStats(raw: unknown): ItemStats | undefined {
  if (!isRecord(raw)) return undefined;
  const stats: ItemStats = {};
  for (const [key, value] of Object.entries(raw)) {
    if (isStatName(key) && typeof value === 'number') stats[key] = value;
  }
  return stats;
}

/** One medal of medals.json as an item, or null when it is missing a part. */
function readItem(raw: unknown): InventoryItem | null {
  if (!isRecord(raw) || !isItemType(raw.type) || typeof raw.name !== 'string' || typeof raw.cost !== 'number') return null;
  if (typeof raw.id !== 'string' || typeof raw.icon !== 'string' || (raw.gear !== undefined && !isGearKind(raw.gear))) return null;
  // `cost` (the price in gold) is what the game calls an item's value.
  const item: InventoryItem = { id: raw.id, type: raw.type, name: raw.name, value: priceInGold(raw.cost), icon: raw.icon, stats: readStats(raw.stats) };
  if (typeof raw.weight === 'number') item.weight = raw.weight;
  if (isGearKind(raw.gear)) item.gear = raw.gear;
  if (typeof raw.kind === 'string') item.kind = raw.kind;
  if (isItemBase(raw.base)) item.base = raw.base;
  if (isMagicBonus(raw.bonus) && raw.bonus > 0) item.bonus = raw.bonus;
  return item;
}

export const WEAPONS: readonly InventoryItem[] = weaponItems();
export const SHIELDS: readonly InventoryItem[] = shieldItems();
export const ARMORS: readonly InventoryItem[] = armorItems();
export const MEDALS: readonly InventoryItem[] = medals.items.flatMap((raw: unknown) => readItem(raw) ?? []);

/** Weapons to fight with (not shields). */
export const HAND_WEAPONS: readonly InventoryItem[] = WEAPONS.filter((item) => item.gear === 'weapon');

/** Where each catalogue icon's art lives: the weapons' and shields' pictures, the medals' files. */
export function catalogIconSources(): Array<{ key: string; src: string }> {
  const weapons = WEAPON_BASES.flatMap((base) => (base === 'unarmed' ? [] : weaponStats(base).art.map((src, i) => ({ key: `weapon_${base}_${numbered(i)}`, src }))));
  const shields = ARMOR_BASES.flatMap((base) => (armorStats(base).category === 'shield' ? armorStats(base).art.map((src, i) => ({ key: `${base}_${numbered(i)}`, src })) : []));
  const medalArt = medals.items.flatMap((raw: unknown) => (isRecord(raw) && typeof raw.src === 'string' && typeof raw.icon === 'string' ? [{ key: raw.icon, src: raw.src }] : []));
  return [...weapons, ...shields, ...medalArt];
}

/** The colours each suit of armour comes in, by its id. */
const COLOURS: ReadonlyMap<string, readonly string[]> = new Map(ARMORS.flatMap((item) => (item.id ? [[item.id, colourKeys(item.id)] as const] : [])));

/** Where each colour of each suit of armour lies in the armour sheet (its column, the colour's row), by icon key. */
export function armorIconRegions(): Record<string, Rect> {
  const regions: Record<string, Rect> = {};
  for (const base of ARMOR_BASES) {
    const column = armorColumn(base);
    if (column === null) continue;
    colourKeys(`armor_${base}`).forEach((key, row) => { regions[key] = { x: (column - 1) * ARMOR_ICON, y: row * ARMOR_ICON, w: ARMOR_ICON, h: ARMOR_ICON }; });
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

/** The catalogue entry of a D&D base to hand out (the first of its pictures), if the catalogue has one. */
export function catalogueItem(from: readonly InventoryItem[], base: string): InventoryItem | null {
  const item = from.find((entry) => entry.base === base);
  return item ? freshCopy(item) : null;
}
