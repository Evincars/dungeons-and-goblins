import { dice } from './Dice';
import type { Dice } from './Dice';

/**
 * The weapons table of the 5th edition System Reference Document (plus the Dungeon Master's Guide pistol and
 * musket, and a punch dagger for knuckles and katars, which the SRD lacks). An item's `base` in
 * src/data/weapons.json names one of these; its own magic bonus comes on top.
 */

export const DAMAGE_TYPES = ['bludgeoning', 'piercing', 'slashing'] as const;
export type DamageType = (typeof DAMAGE_TYPES)[number];

/**
 * finesse: uses STR or DEX, whichever is better. light: fits a second hand. heavy: clumsy for small folk.
 * two_handed: needs both hands. reach: strikes from further off. thrown: can be hurled. loading: one shot per
 * turn. ammunition: shoots arrows, bolts or bullets.
 */
export const WEAPON_PROPERTIES = ['finesse', 'light', 'heavy', 'two_handed', 'reach', 'thrown', 'loading', 'ammunition'] as const;
export type WeaponProperty = (typeof WEAPON_PROPERTIES)[number];

export type WeaponRule = {
  damage: Dice;
  type: DamageType;
  /** Simple weapons anyone can use; martial ones need training. */
  category: 'simple' | 'martial';
  /** Melee weapons strike with STR, ranged ones shoot with DEX (finesse lets either choose). */
  range: 'melee' | 'ranged';
  properties: readonly WeaponProperty[];
  /** Versatile weapons deal these dice instead when held in both hands. */
  versatile?: Dice;
};

export const WEAPON_BASES = [
  'unarmed', 'club', 'dagger', 'punch_dagger', 'greatclub', 'handaxe', 'javelin', 'light_hammer', 'mace', 'quarterstaff',
  'sickle', 'spear',
  'light_crossbow', 'dart', 'shortbow', 'sling',
  'battleaxe', 'glaive', 'greataxe', 'greatsword', 'halberd', 'longsword', 'maul', 'pike', 'scimitar',
  'shortsword', 'whip', 'rapier', 'hand_crossbow', 'heavy_crossbow', 'longbow', 'pistol', 'musket',
] as const;
export type WeaponBase = (typeof WEAPON_BASES)[number];

export function isWeaponBase(value: unknown): value is WeaponBase {
  return WEAPON_BASES.some((base) => base === value);
}

export const WEAPON_TABLE = {
  /** A punch or kick: 1 damage plus STR, no dice. */
  unarmed: { damage: dice(0, 4, 1), type: 'bludgeoning', category: 'simple', range: 'melee', properties: [] },
  club: { damage: dice(1, 4), type: 'bludgeoning', category: 'simple', range: 'melee', properties: ['light'] },
  dagger: { damage: dice(1, 4), type: 'piercing', category: 'simple', range: 'melee', properties: ['finesse', 'light', 'thrown'] },
  punch_dagger: { damage: dice(1, 4), type: 'piercing', category: 'simple', range: 'melee', properties: ['finesse', 'light'] },
  greatclub: { damage: dice(1, 8), type: 'bludgeoning', category: 'simple', range: 'melee', properties: ['two_handed'] },
  handaxe: { damage: dice(1, 6), type: 'slashing', category: 'simple', range: 'melee', properties: ['light', 'thrown'] },
  javelin: { damage: dice(1, 6), type: 'piercing', category: 'simple', range: 'melee', properties: ['thrown'] },
  light_hammer: { damage: dice(1, 4), type: 'bludgeoning', category: 'simple', range: 'melee', properties: ['light', 'thrown'] },
  mace: { damage: dice(1, 6), type: 'bludgeoning', category: 'simple', range: 'melee', properties: [] },
  quarterstaff: { damage: dice(1, 6), type: 'bludgeoning', category: 'simple', range: 'melee', properties: [], versatile: dice(1, 8) },
  sickle: { damage: dice(1, 4), type: 'slashing', category: 'simple', range: 'melee', properties: ['light'] },
  spear: { damage: dice(1, 6), type: 'piercing', category: 'simple', range: 'melee', properties: ['thrown'], versatile: dice(1, 8) },
  light_crossbow: { damage: dice(1, 8), type: 'piercing', category: 'simple', range: 'ranged', properties: ['ammunition', 'loading', 'two_handed'] },
  dart: { damage: dice(1, 4), type: 'piercing', category: 'simple', range: 'ranged', properties: ['finesse', 'thrown'] },
  shortbow: { damage: dice(1, 6), type: 'piercing', category: 'simple', range: 'ranged', properties: ['ammunition', 'two_handed'] },
  sling: { damage: dice(1, 4), type: 'bludgeoning', category: 'simple', range: 'ranged', properties: ['ammunition'] },
  battleaxe: { damage: dice(1, 8), type: 'slashing', category: 'martial', range: 'melee', properties: [], versatile: dice(1, 10) },
  glaive: { damage: dice(1, 10), type: 'slashing', category: 'martial', range: 'melee', properties: ['heavy', 'reach', 'two_handed'] },
  greataxe: { damage: dice(1, 12), type: 'slashing', category: 'martial', range: 'melee', properties: ['heavy', 'two_handed'] },
  greatsword: { damage: dice(2, 6), type: 'slashing', category: 'martial', range: 'melee', properties: ['heavy', 'two_handed'] },
  halberd: { damage: dice(1, 10), type: 'slashing', category: 'martial', range: 'melee', properties: ['heavy', 'reach', 'two_handed'] },
  longsword: { damage: dice(1, 8), type: 'slashing', category: 'martial', range: 'melee', properties: [], versatile: dice(1, 10) },
  maul: { damage: dice(2, 6), type: 'bludgeoning', category: 'martial', range: 'melee', properties: ['heavy', 'two_handed'] },
  pike: { damage: dice(1, 10), type: 'piercing', category: 'martial', range: 'melee', properties: ['heavy', 'reach', 'two_handed'] },
  scimitar: { damage: dice(1, 6), type: 'slashing', category: 'martial', range: 'melee', properties: ['finesse', 'light'] },
  shortsword: { damage: dice(1, 6), type: 'piercing', category: 'martial', range: 'melee', properties: ['finesse', 'light'] },
  whip: { damage: dice(1, 4), type: 'slashing', category: 'martial', range: 'melee', properties: ['finesse', 'reach'] },
  rapier: { damage: dice(1, 8), type: 'piercing', category: 'martial', range: 'melee', properties: ['finesse'] },
  hand_crossbow: { damage: dice(1, 6), type: 'piercing', category: 'martial', range: 'ranged', properties: ['ammunition', 'light', 'loading'] },
  heavy_crossbow: { damage: dice(1, 10), type: 'piercing', category: 'martial', range: 'ranged', properties: ['ammunition', 'heavy', 'loading', 'two_handed'] },
  longbow: { damage: dice(1, 8), type: 'piercing', category: 'martial', range: 'ranged', properties: ['ammunition', 'heavy', 'two_handed'] },
  pistol: { damage: dice(1, 10), type: 'piercing', category: 'martial', range: 'ranged', properties: ['ammunition', 'loading'] },
  musket: { damage: dice(1, 12), type: 'piercing', category: 'martial', range: 'ranged', properties: ['ammunition', 'loading', 'two_handed'] },
} as const satisfies Record<WeaponBase, WeaponRule>;

/** The magic bonus of the finest weapons and armour: +1 is uncommon, +2 rare, +3 very rare. */
export const MAX_MAGIC_BONUS = 3;
