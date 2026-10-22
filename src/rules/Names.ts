import { text } from '../core/texts';
import type { ArmorBase, ArmorRule } from './ArmorTable';
import type { DamageType, WeaponBase, WeaponProperty, WeaponRule } from './WeaponTable';

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
