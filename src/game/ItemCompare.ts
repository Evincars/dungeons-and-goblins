import type { InventoryItem } from '../world';
import { armorRule, magicBonus, weaponRule } from '../rules/Equipment';
import { diceRange } from '../rules/Dice';

/**
 * Two items side by side (the inventory's comparison): for two of one kind, whether the second is better or worse than
 * the first on what tells them apart — the Armor Class armour or a shield gives, a weapon's damage, and the weight.
 */

/** What two items are compared on. */
export const MEASURES = ['ac', 'damage', 'weight'] as const;
export type Measure = (typeof MEASURES)[number];
/** Better (1), worse (-1) or the same (0). */
export type Verdict = 1 | -1 | 0;

/** The Armor Class armour or a shield gives (its table's AC and its magic), if it is either. */
function armorClassOf(item: InventoryItem): number | null {
  const armor = armorRule(item);
  return armor ? armor.rule.ac + magicBonus(item) : null;
}

/** A weapon's average damage a blow (its dice and its magic), if it is one. */
function damageOf(item: InventoryItem): number | null {
  const weapon = weaponRule(item);
  return weapon ? diceRange(weapon.rule.damage).average + magicBonus(item) : null;
}

/** Higher is better (`more`) or lower is: the verdict on `value` against `other`, when both have one. */
function verdict(value: number | null, other: number | null, more: boolean): Verdict | undefined {
  if (value === null || other === null) return undefined;
  if (value === other) return 0;
  return value > other === more ? 1 : -1;
}

/**
 * How `item` fares against `against` on each measure both have: more AC and more damage are better, less weight is.
 * Items of different kinds (a sword and a helmet) are not weighed against each other: nothing.
 */
export function compareItems(item: InventoryItem, against: InventoryItem): Partial<Record<Measure, Verdict>> {
  if (item.type !== against.type) return {};
  const out: Partial<Record<Measure, Verdict>> = {};
  const ac = verdict(armorClassOf(item), armorClassOf(against), true);
  if (ac !== undefined) out.ac = ac;
  const damage = verdict(damageOf(item), damageOf(against), true);
  if (damage !== undefined) out.damage = damage;
  const weight = verdict(item.weight ?? null, against.weight ?? null, false);
  if (weight !== undefined) out.weight = weight;
  return out;
}
