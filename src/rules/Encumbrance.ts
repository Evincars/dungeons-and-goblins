import type { InventoryItem } from '../world';

/**
 * How a load slows a hero: up to LOAD_EASY of what they can carry they move freely; past it they slow, down to a walk
 * at their whole load (and they cannot sprint then); more than that they can still drag along at a walk.
 */

/** Kilograms a hero can carry, bag and worn gear together. */
export const MAX_CARRY_KG = 100;
/** The share of that a hero carries without being slowed. */
export const LOAD_EASY = 0.8;
/** A fully laden hero walks at this share of their pace. */
export const WALK_PACE = 0.45;

/** Everything a hero carries, in kilograms, added up without building anything (it is asked every tick). */
export function loadKg(inventory: readonly (InventoryItem | null)[] | undefined, equipped: Partial<Record<string, InventoryItem>> | undefined): number {
  let kg = 0;
  if (inventory) for (const item of inventory) kg += item?.weight ?? 0;
  if (!equipped) return kg;
  for (const slot in equipped) kg += equipped[slot]?.weight ?? 0;
  return kg;
}

/** How much of their pace a hero keeps under a load (1 until LOAD_EASY, down to WALK_PACE at the whole load). */
export function loadPace(kg: number): number {
  const share = kg / MAX_CARRY_KG;
  if (share <= LOAD_EASY) return 1;
  if (share >= 1) return WALK_PACE;
  return 1 - ((share - LOAD_EASY) / (1 - LOAD_EASY)) * (1 - WALK_PACE);
}

/** Whether a hero is fully laden (or more): they walk, and cannot sprint. */
export function fullyLaden(kg: number): boolean {
  return kg >= MAX_CARRY_KG;
}
