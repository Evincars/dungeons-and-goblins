import { STAT_NAMES } from '../world';
import type { EquipSlot, InventoryItem, StatName } from '../world';
import { statTotals } from '../entities/Items';

/**
 * The six abilities as the tabletop rules use them: a score (8 is below average, 10 average, 20 heroic) and
 * the modifier it gives, which is what dice rolls actually add. The modifier is the number that matters.
 * A hero's base scores come from their class (src/data/classes.json), an enemy's from its monster block.
 */

/** A score's modifier: 10–11 give +0, every two points either way one more (8 → -1, 15 → +2, 20 → +5). */
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export type Abilities = { scores: Record<StatName, number>; modifiers: Record<StatName, number> };

/** Scores (base plus what the worn gear adds) and their modifiers. */
export function abilities(equipped: Partial<Record<EquipSlot, InventoryItem>>, base: Readonly<Record<StatName, number>>): Abilities {
  const scores = statTotals(equipped);
  const modifiers = { ...scores };
  for (const stat of STAT_NAMES) {
    scores[stat] += base[stat];
    modifiers[stat] = abilityModifier(scores[stat]);
  }
  return { scores, modifiers };
}

/** Levels 1–4 add +2 to attacks a character is trained in, and every four levels after that one more. */
const PROFICIENCY_START = 2;
const LEVELS_PER_PROFICIENCY = 4;

export function proficiencyBonus(level: number): number {
  return PROFICIENCY_START + Math.floor((Math.max(1, level) - 1) / LEVELS_PER_PROFICIENCY);
}
