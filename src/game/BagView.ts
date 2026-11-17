import type { BagSquare, InventoryItem, ItemType } from '../world';
import { fuzzyMatch } from '../core/fuzzy';

/**
 * Which of the bag's squares the inventory shows, and in what order: under a filter (kinds of item), a search (the
 * letters of a name, in order: core/fuzzy.ts) and a sort. The bag itself is never rearranged by it.
 */

/** How the bag can be ordered: as it lies, or by price, weight (most first) or whether the hero is trained in it. */
export const BAG_SORTS = ['none', 'price', 'weight', 'training'] as const;
export type BagSort = (typeof BAG_SORTS)[number];

export type BagQuery = {
  /** The kinds of item shown (null: every kind). */
  types: readonly ItemType[] | null;
  /** The search typed ('' for none). */
  search: string;
  sort: BagSort;
  /** Whether the hero is trained in an item (for the `training` sort). */
  trained: (item: InventoryItem) => boolean;
};

/** Whether the bag shows an item: of the filter's kinds, its name holding the letters searched for. */
export function bagShows(item: InventoryItem, query: BagQuery): boolean {
  return (!query.types || query.types.includes(item.type)) && (query.search === '' || fuzzyMatch(query.search, item.name) !== null);
}

/** The order under a sort: the dearest, the heaviest, or what the hero is trained in, first (0 for a tie). */
export function compareBagItems(a: InventoryItem, b: InventoryItem, query: BagQuery): number {
  if (query.sort === 'price') return b.value - a.value;
  if (query.sort === 'weight') return (b.weight ?? 0) - (a.weight ?? 0);
  if (query.sort === 'training') return Number(query.trained(b)) - Number(query.trained(a));
  return 0;
}

/**
 * The bag squares to show, in order: every square as it lies; or, filtered, searched or sorted, the items that show (in
 * the sort's order, ties as they lie) and then the free squares, to drop things onto.
 */
export function bagView(inventory: readonly BagSquare[], size: number, query: BagQuery, out: number[]): number[] {
  out.length = 0;
  const plain = !query.types && query.search === '' && query.sort === 'none';
  for (let i = 0; i < size; i++) {
    const item = inventory[i];
    if (item ? bagShows(item, query) : plain) out.push(i);
  }
  if (plain) return out;
  out.sort((a, b) => {
    const x = inventory[a];
    const y = inventory[b];
    return (x && y ? compareBagItems(x, y, query) : 0) || a - b;
  });
  for (let i = 0; i < size; i++) if (!inventory[i]) out.push(i);
  return out;
}
