/** Generic BSP (Binary Space Partition) rectangle splitter. */

export type Rect = { x: number; y: number; w: number; h: number };

export type BspNode = { rect: Rect; left?: BspNode; right?: BspNode };

/** Builds the BSP tree; leaves are the partitions rooms get placed in. */
export function bspTree(area: Rect, minSize: number, depth: number, rng: () => number): BspNode {
  const node: BspNode = { rect: area };
  if (depth <= 0) return node;

  const canH = area.h >= minSize * 2;
  const canV = area.w >= minSize * 2;
  if (!canH && !canV) return node;

  // Prefer cutting across the longer side so partitions stay roughly square.
  const horizontal = canH && (!canV || (area.h > area.w * 1.25) || (area.w <= area.h * 1.25 && rng() < 0.5));
  if (horizontal) {
    const cut = minSize + Math.floor(rng() * (area.h - minSize * 2 + 1));
    node.left = bspTree({ ...area, h: cut }, minSize, depth - 1, rng);
    node.right = bspTree({ ...area, y: area.y + cut, h: area.h - cut }, minSize, depth - 1, rng);
  } else {
    const cut = minSize + Math.floor(rng() * (area.w - minSize * 2 + 1));
    node.left = bspTree({ ...area, w: cut }, minSize, depth - 1, rng);
    node.right = bspTree({ ...area, x: area.x + cut, w: area.w - cut }, minSize, depth - 1, rng);
  }
  return node;
}

export function bspLeaves(node: BspNode, out: BspNode[] = []): BspNode[] {
  if (!node.left || !node.right) out.push(node);
  else { bspLeaves(node.left, out); bspLeaves(node.right, out); }
  return out;
}
