import type { InventoryItem } from '../world';
import { armorStats, isArmorBase } from './ArmorTable';
import type { ArmorBase, ArmorRule } from './ArmorTable';
import { MAX_MAGIC_BONUS, isWeaponBase, weaponStats } from './WeaponTable';
import type { WeaponBase, WeaponRule } from './WeaponTable';

/** What an item plays as under the rules: a weapon from the weapons table, or armour or a shield. */
export type ItemBase = WeaponBase | ArmorBase;

export function isItemBase(value: unknown): value is ItemBase {
  return isWeaponBase(value) || isArmorBase(value);
}

/** A magic bonus the rules allow: a whole number from +0 to +3. */
export function isMagicBonus(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_MAGIC_BONUS;
}

/** The item's magic bonus to hit and damage (a weapon) or to Armor Class (armour, a shield). */
export function magicBonus(item: InventoryItem | undefined): number {
  return item?.bonus ?? 0;
}

/** The weapons-table entry an item fights as, if it is a weapon. */
export function weaponRule(item: InventoryItem | undefined): { base: WeaponBase; rule: WeaponRule } | null {
  const base = item?.base;
  return isWeaponBase(base) ? { base, rule: weaponStats(base) } : null;
}

/** The armour-table entry an item protects as, if it is armour or a shield. */
export function armorRule(item: InventoryItem | undefined): { base: ArmorBase; rule: ArmorRule } | null {
  const base = item?.base;
  return isArmorBase(base) ? { base, rule: armorStats(base) } : null;
}

export function isShield(item: InventoryItem | undefined): boolean {
  return armorRule(item)?.rule.category === 'shield';
}

/** The STR score an item asks of whoever puts it on (heavy armour), 0 when it asks none. */
export function strengthNeeded(item: InventoryItem | undefined): number {
  return armorRule(item)?.rule.strength ?? 0;
}

/** Whether a hero with this STR score can put the item on at all. */
export function strongEnough(item: InventoryItem | undefined, strength: number): boolean {
  return strength >= strengthNeeded(item);
}

/** A weapon that needs both hands (a greatsword, a bow): nothing else can be held beside it. */
export function needsBothHands(item: InventoryItem | undefined): boolean {
  return !!weaponRule(item)?.rule.properties.includes('two_handed');
}
