import { STAT_NAMES, isStatName } from '../world';
import type { StatName } from '../world';
import { ensure } from '../core/errors';
import { isDieSides } from './Dice';
import type { DieSides } from './Dice';
import type { ArmorRule } from './ArmorTable';
import type { WeaponRule } from './WeaponTable';
import classes from '../data/classes.json';

/**
 * The hero classes a new game offers, read from src/data/classes.json (tune them there). A class gives the
 * hero's sprite, hit points, ability scores, what armour and weapons they are trained in, and features.
 */

export const HERO_CLASSES = ['barbarian', 'warrior'] as const;
export type HeroClassId = (typeof HERO_CLASSES)[number];

export function isHeroClassId(value: unknown): value is HeroClassId {
  return HERO_CLASSES.some((id) => id === value);
}

/** The class a hero is when nothing says otherwise. */
export const DEFAULT_CLASS: HeroClassId = 'barbarian';

export type ArmorTraining = ArmorRule['category'];
export type WeaponTraining = WeaponRule['category'];
export const ARMOR_TRAININGS = ['light', 'medium', 'heavy', 'shield'] as const satisfies readonly ArmorTraining[];
export const WEAPON_TRAININGS = ['simple', 'martial'] as const satisfies readonly WeaponTraining[];

/**
 * unarmored_defense (Barbarian): with no armour on, AC is 10 + DEX + CON (a shield still adds).
 * fighting_style_defense (Fighter): +1 AC while wearing armour.
 */
export const CLASS_FEATURES = ['unarmored_defense', 'fighting_style_defense'] as const;
export type ClassFeature = (typeof CLASS_FEATURES)[number];

export type HeroClass = {
  id: HeroClassId;
  /** The CharacterDef that draws this class. */
  character: string;
  hitDie: DieSides;
  hitPoints: number;
  abilities: Readonly<Record<StatName, number>>;
  armor: readonly ArmorTraining[];
  weapons: readonly WeaponTraining[];
  savingThrows: readonly StatName[];
  features: readonly ClassFeature[];
};

const isArmorTraining = (v: unknown): v is ArmorTraining => ARMOR_TRAININGS.some((t) => t === v);
const isWeaponTraining = (v: unknown): v is WeaponTraining => WEAPON_TRAININGS.some((t) => t === v);
const isClassFeature = (v: unknown): v is ClassFeature => CLASS_FEATURES.some((f) => f === v);

/** Every entry of a list is one of the known words, or the file is wrong. */
function listOf<T>(id: string, field: string, values: readonly unknown[], valid: (v: unknown) => v is T): T[] {
  ensure(values.every(valid), `Unknown ${field} in class ${id}`, { id, field, values: values.join(', ') });
  return values.filter(valid);
}

type RawClass = (typeof classes)[HeroClassId];

/** One class from the file, checked: a mistake there stops the game with a clear message instead of half-working. */
function readClass(id: HeroClassId, raw: RawClass): HeroClass {
  ensure(isDieSides(raw.hitDie) && raw.hitPoints > 0, `Bad hit die or hit points in class ${id}`, { id });
  const abilities: Record<StatName, number> = raw.abilities;
  ensure(STAT_NAMES.every((stat) => Number.isFinite(abilities[stat])), `Missing ability score in class ${id}`, { id });
  return {
    id,
    character: raw.character,
    hitDie: isDieSides(raw.hitDie) ? raw.hitDie : 10,
    hitPoints: raw.hitPoints,
    abilities,
    armor: listOf(id, 'armour', raw.armor, isArmorTraining),
    weapons: listOf(id, 'weapon training', raw.weapons, isWeaponTraining),
    savingThrows: listOf(id, 'saving throw', raw.savingThrows, isStatName),
    features: listOf(id, 'feature', raw.features, isClassFeature),
  };
}

export const CLASSES = {
  barbarian: readClass('barbarian', classes.barbarian),
  warrior: readClass('warrior', classes.warrior),
} as const satisfies Record<HeroClassId, HeroClass>;

/** A hero's class (the default one for anything without). */
export function heroClass(id: HeroClassId | undefined): HeroClass {
  return CLASSES[id ?? DEFAULT_CLASS];
}

export function hasFeature(cls: HeroClass, feature: ClassFeature): boolean {
  return cls.features.includes(feature);
}

/** Trained in this kind of armour (no disadvantage on attacks while wearing it). */
export function armorProficient(cls: HeroClass, category: ArmorTraining): boolean {
  return cls.armor.includes(category);
}

/** Trained in this kind of weapon (adds the proficiency bonus to hit). */
export function weaponProficient(cls: HeroClass, category: WeaponTraining): boolean {
  return cls.weapons.includes(category);
}
