import { ensure, StateError } from '../core/errors';
import { hasKey, isRecord } from '../core/guards';
import data from '../data/armors.json';
import shieldData from '../data/shields.json';

/**
 * The armour table of D&D 5e, read from src/data/armors.json and the shields from src/data/shields.json (their single
 * source: change an entry there and the game follows): Armor Class, how much DEX counts, the STR needed to wear it, price
 * and weight. An item's `base` names one of these; its own magic bonus comes on top.
 */

/** Light, medium and heavy armour (who is trained in it), a shield (added on top), or clothes (no armour at all). */
export const ARMOR_CATEGORIES = ['light', 'medium', 'heavy', 'shield', 'clothes'] as const;
export type ArmorCategory = (typeof ARMOR_CATEGORIES)[number];

export type ArmorRule = {
  name: string;
  category: ArmorCategory;
  /** Armor Class it gives before DEX (for a shield, what it adds). */
  ac: number;
  /** The most of the DEX modifier that counts; null for no limit, 0 for none. */
  dexCap: number | null;
  /** STR score needed to put it on at all; null when anyone can. */
  strength: number | null;
  /** Too noisy to sneak in. */
  stealthDisadvantage: boolean;
  /** Price in gold, weight in kg. */
  cost: number;
  weight: number;
  /** Its picture: a column of the armour sheet (body armour), or its own pictures (a shield). */
  column: number | null;
  art: readonly string[];
};

export type ArmorBase = Extract<keyof typeof data.armors | keyof typeof shieldData.shields, string>;

export function isArmorBase(value: unknown): value is ArmorBase {
  return typeof value === 'string' && (hasKey(data.armors, value) || hasKey(shieldData.shields, value));
}

/** An entry of either file, as written. */
function rawArmor(base: ArmorBase): unknown {
  return hasKey(data.armors, base) ? data.armors[base] : hasKey(shieldData.shields, base) ? shieldData.shields[base] : undefined;
}

const isCategory = (value: unknown): value is ArmorCategory => ARMOR_CATEGORIES.some((c) => c === value);
const nullOrNumber = (value: unknown): value is number | null => value === null || (typeof value === 'number' && value >= 0);

/** One entry of the data file, checked: anything missing or misspelt stops the game loading, naming the armour. */
function readArmor(key: string, raw: unknown): ArmorRule {
  ensure(isRecord(raw), `Bad armour ${key}`, { key });
  const { name, category, ac, dexCap, strength, stealthDisadvantage, cost, weight } = raw;
  ensure(typeof name === 'string' && isCategory(category) && typeof ac === 'number', `Bad armour ${key}`, { key });
  ensure(nullOrNumber(dexCap) && nullOrNumber(strength) && typeof stealthDisadvantage === 'boolean', `Bad armour rules for ${key}`, { key });
  ensure(typeof cost === 'number' && cost >= 0 && typeof weight === 'number' && weight >= 0, `Bad cost or weight for armour ${key}`, { key });
  const column = typeof raw.column === 'number' ? raw.column : null;
  const art = Array.isArray(raw.art) ? raw.art.filter((s): s is string => typeof s === 'string') : [];
  return { name, category, ac, dexCap, strength, stealthDisadvantage, cost, weight, column, art };
}

/** Every armour of the data files, in their order (the body armour, then the shields). */
export const ARMOR_BASES: readonly ArmorBase[] = [...Object.keys(data.armors), ...Object.keys(shieldData.shields)].filter(isArmorBase);

const TABLE: ReadonlyMap<ArmorBase, ArmorRule> = new Map(ARMOR_BASES.map((base) => [base, readArmor(base, rawArmor(base))]));

/** An armour's entry in the table. */
export function armorStats(base: ArmorBase): ArmorRule {
  const rule = TABLE.get(base);
  if (!rule) throw new StateError(`No armour ${base}`, { base });
  return rule;
}

/** Armor Class with no armour on: 10 plus the DEX modifier. */
export const UNARMORED_AC = 10;
