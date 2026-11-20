import { ensure, StateError } from '../core/errors';
import { hasKey, isRecord } from '../core/guards';
import { dice, parseDice } from './Dice';
import type { Dice } from './Dice';
import { PHYSICAL_DAMAGE_TYPES } from './DamageTypes';
import type { PhysicalDamageType } from './DamageTypes';
import data from '../data/weapons.json';

/**
 * The weapons table of D&D 5e, read from src/data/weapons.json (its single source: change a weapon there and the game
 * follows): damage, sort, properties, range, price and weight. An item's `base` names one of these; its own magic bonus
 * comes on top. A punch (`unarmed`) is the rules' own and lives here.
 */

export const DAMAGE_TYPES = PHYSICAL_DAMAGE_TYPES;
export type DamageType = PhysicalDamageType;

/**
 * finesse: uses STR or DEX, whichever is better. light: fits a second hand (two-weapon fighting needs both light).
 * heavy: clumsy for small folk. two_handed: needs both hands. reach: strikes further off. thrown: can be hurled.
 * loading: one shot per attack. ammunition: shoots arrows, bolts, bullets or needles. special: rules of its own (a lance,
 * a net).
 */
export const WEAPON_PROPERTIES = ['finesse', 'light', 'heavy', 'two_handed', 'reach', 'thrown', 'loading', 'ammunition', 'special'] as const;
export type WeaponProperty = (typeof WEAPON_PROPERTIES)[number];

export type WeaponRule = {
  name: string;
  damage: Dice;
  type: DamageType;
  /** Simple weapons anyone can use; martial ones need training. */
  category: 'simple' | 'martial';
  /** Melee weapons strike with STR, ranged ones shoot with DEX (finesse lets either choose). */
  range: 'melee' | 'ranged';
  properties: readonly WeaponProperty[];
  /** Versatile weapons deal these dice instead when held in both hands. */
  versatile?: Dice;
  /** A thrown or shooting weapon's range in feet: normal (no penalty), and long (with disadvantage). */
  distance?: readonly [normal: number, long: number];
  /** Price in gold (fractions for silver and copper), weight in kg. */
  cost: number;
  weight: number;
  /** Its item pictures; each is a weapon that can be found (none yet for some). */
  art: readonly string[];
};

/** A weapon of the table, or a punch. */
export type WeaponBase = Extract<keyof typeof data.weapons, string> | 'unarmed';

export function isWeaponBase(value: unknown): value is WeaponBase {
  return value === 'unarmed' || (typeof value === 'string' && hasKey(data.weapons, value));
}

const isProperty = (value: unknown): value is WeaponProperty => WEAPON_PROPERTIES.some((p) => p === value);
const isDamageType = (value: unknown): value is DamageType => DAMAGE_TYPES.some((t) => t === value);

/** Damage as the data writes it: dice (`1d8`), a flat number (`1`), or null for none. */
function readDamage(key: string, raw: unknown): Dice {
  if (raw === null) return dice(0, 4);
  if (typeof raw === 'string' && /^\d+$/.test(raw)) return dice(0, 4, Number(raw));
  const parsed = typeof raw === 'string' ? parseDice(raw) : null;
  ensure(parsed, `Bad damage for weapon ${key}`, { key, damage: String(raw) });
  return parsed;
}

function readDistance(key: string, raw: unknown): readonly [number, number] | undefined {
  if (raw === undefined) return undefined;
  const ok = Array.isArray(raw) && raw.length === 2 && raw.every((m) => typeof m === 'number' && m > 0) && raw[0] <= raw[1];
  ensure(ok, `Bad distance for weapon ${key}`, { key });
  return [Number(raw[0]), Number(raw[1])];
}

function readStrings(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((s): s is string => typeof s === 'string') : [];
}

/** One entry of the data file, checked: anything missing or misspelt stops the game loading, naming the weapon. */
function readWeapon(key: string, raw: unknown): WeaponRule {
  ensure(isRecord(raw), `Bad weapon ${key}`, { key });
  const { name, category, range, cost, weight } = raw;
  ensure(typeof name === 'string' && (category === 'simple' || category === 'martial') && (range === 'melee' || range === 'ranged'), `Bad weapon ${key}`, { key });
  ensure(typeof cost === 'number' && cost >= 0 && typeof weight === 'number' && weight >= 0, `Bad cost or weight for weapon ${key}`, { key });
  const damage = readDamage(key, raw.damage);
  const type = raw.damageType ?? 'bludgeoning';
  ensure(isDamageType(type), `Bad damage type for weapon ${key}`, { key });
  const properties = readStrings(raw.properties);
  ensure(properties.every(isProperty), `Unknown property for weapon ${key}`, { key, properties: properties.join(', ') });
  const rule: WeaponRule = { name, damage, type, category, range, properties: properties.filter(isProperty), cost, weight, art: readStrings(raw.art) };
  if (raw.versatile !== undefined) rule.versatile = readDamage(key, raw.versatile);
  const distance = readDistance(key, raw.distance);
  if (distance) rule.distance = distance;
  return rule;
}

/** A punch or kick: 1 damage plus STR, no dice. */
const UNARMED: WeaponRule = {
  name: 'Unarmed strike', damage: dice(0, 4, 1), type: 'bludgeoning', category: 'simple', range: 'melee', properties: [], cost: 0, weight: 0, art: [],
};

/** Every weapon of the data file, in its order. */
export const WEAPON_BASES: readonly WeaponBase[] = ['unarmed', ...Object.keys(data.weapons).filter(isWeaponBase)];

const TABLE: ReadonlyMap<WeaponBase, WeaponRule> = new Map(WEAPON_BASES.map((base) => [
  base, base === 'unarmed' ? UNARMED : readWeapon(base, data.weapons[base]),
]));

/** A weapon's entry in the table. */
export function weaponStats(base: WeaponBase): WeaponRule {
  const rule = TABLE.get(base);
  if (!rule) throw new StateError(`No weapon ${base}`, { base });
  return rule;
}

/** The magic bonus of the finest weapons and armour: +1 is uncommon, +2 rare, +3 very rare. */
export const MAX_MAGIC_BONUS = 3;
