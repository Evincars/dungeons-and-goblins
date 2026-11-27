import type { InventoryItem } from '../world';
import { magicBonus } from './Equipment';

/**
 * How rare an item is, as Baldur's Gate names it and colours its name: plain gear is common; magic +1 (or a weapon dealing
 * damage of another kind) uncommon, +2 rare, +3 very rare — a weapon that deals damage of another kind one step rarer.
 */

export const RARITIES = ['common', 'uncommon', 'rare', 'very_rare'] as const;
export type Rarity = (typeof RARITIES)[number];

/** Each rarity's colour: an item's name is written in it. */
export const RARITY_COLORS = {
  common: 0xe8e2d4, uncommon: 0x3fd04e, rare: 0x4aa8ff, very_rare: 0xb978ff,
} as const satisfies Record<Rarity, number>;

/** An item's rarity: by its magic, a step more for damage of another kind. */
export function rarityOf(item: InventoryItem): Rarity {
  const steps = magicBonus(item) + (item.extraDamage ? 1 : 0);
  return RARITIES[Math.min(RARITIES.length - 1, Math.max(0, steps))];
}

/** Whether an item is magic: a bonus, or damage of another kind. */
export function isMagicItem(item: InventoryItem): boolean {
  return magicBonus(item) > 0 || !!item.extraDamage;
}
