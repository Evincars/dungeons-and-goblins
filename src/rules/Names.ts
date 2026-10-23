import { text } from '../core/texts';
import type { ArmorBase, ArmorRule } from './ArmorTable';
import type { DamageType, WeaponBase, WeaponProperty, WeaponRule } from './WeaponTable';
import type { ArmorTraining, ClassFeature, DndClass, HeroClassId, WeaponTraining } from './Classes';

/** How the rules' terms read on screen (from src/data/texts.json). */

export function weaponName(base: WeaponBase): string {
  return text(`rules.weapon.${base}` as const);
}

export function armorName(base: ArmorBase): string {
  return text(`rules.armor.${base}` as const);
}

export function armorCategoryName(category: ArmorRule['category']): string {
  return text(`rules.armor_category.${category}` as const);
}

export function damageTypeName(type: DamageType): string {
  return text(`rules.damage.${type}` as const);
}

export function weaponCategoryName(category: WeaponRule['category']): string {
  return text(`rules.category.${category}` as const);
}

export function rangeName(range: WeaponRule['range']): string {
  return text(`rules.range.${range}` as const);
}

export function propertyName(property: WeaponProperty): string {
  return text(`rules.property.${property}` as const);
}

export function heroName(id: HeroClassId): string {
  return text(`hero.${id}.name` as const);
}

export function heroBlurb(id: HeroClassId): string {
  return text(`hero.${id}.blurb` as const);
}

/** A D&D class as the game calls it (a fighter is a Warrior). */
export function dndClassName(cls: DndClass): string {
  return text(`dnd_class.${cls}` as const);
}

export function featureName(feature: ClassFeature): string {
  return text(`feature.${feature}.name` as const);
}

export function featureDescription(feature: ClassFeature): string {
  return text(`feature.${feature}.description` as const);
}

/** Armour or weapon training as a word: "light", "shields", "martial"… */
export function trainingName(training: ArmorTraining | WeaponTraining): string {
  return text(`training.${training}` as const);
}
