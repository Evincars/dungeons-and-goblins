/** Generic BSP (Binary Space Partition) rectangle splitter. */

export type Rect = { x: number; y: number; w: number; h: number };

/** `merged`: a leaf left whole where it would have split into two last partitions (room for something big). */
export type BspNode = { rect: Rect; left?: BspNode; right?: BspNode; merged?: boolean };

/**
 * Builds the BSP tree; leaves are the partitions rooms get placed in. With `mergeChance`, a partition one
 * split away from the bottom is sometimes kept whole instead, so it can hold a room twice the usual size.
 */
export function bspTree(area: Rect, minSize: number, depth: number, rng: () => number, mergeChance = 0): BspNode {
  const node: BspNode = { rect: area };
  if (depth <= 0) return node;
  if (depth === 1 && rng() < mergeChance) {
    node.merged = true;
    return node;
  }

  const canH = area.h >= minSize * 2;
  const canV = area.w >= minSize * 2;
  if (!canH && !canV) return node;

  // Prefer cutting across the longer side so partitions stay roughly square.
  const horizontal = canH && (!canV || (area.h > area.w * 1.25) || (area.w <= area.h * 1.25 && rng() < 0.5));
  if (horizontal) {
    const cut = minSize + Math.floor(rng() * (area.h - minSize * 2 + 1));
    node.left = bspTree({ ...area, h: cut }, minSize, depth - 1, rng, mergeChance);
    node.right = bspTree({ ...area, y: area.y + cut, h: area.h - cut }, minSize, depth - 1, rng, mergeChance);
  } else {
    const cut = minSize + Math.floor(rng() * (area.w - minSize * 2 + 1));
    node.left = bspTree({ ...area, w: cut }, minSize, depth - 1, rng, mergeChance);
    node.right = bspTree({ ...area, x: area.x + cut, w: area.w - cut }, minSize, depth - 1, rng, mergeChance);
  }
  return node;
}

export function bspLeaves(node: BspNode, out: BspNode[] = []): BspNode[] {
  if (!node.left || !node.right) out.push(node);
  else { bspLeaves(node.left, out); bspLeaves(node.right, out); }
  return out;
}
