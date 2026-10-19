/** Generic BSP (Binary Space Partition) rectangle splitter.
 *  Returns the leaf rects of the BSP tree — one leaf per potential room.
 */

export type Rect = { x: number; y: number; w: number; h: number };

export function bspSplit(
  area: Rect,
  minSize: number,
  depth: number,
  rng: () => number,
): Rect[] {
  const leaves: Rect[] = [];
  _split(area, minSize, depth, rng, leaves);
  return leaves;
}

function _split(rect: Rect, minSize: number, depth: number, rng: () => number, out: Rect[]): void {
  if (depth <= 0) { out.push(rect); return; }

  const canH = rect.h >= minSize * 2 + 1;
  const canV = rect.w >= minSize * 2 + 1;

  if (!canH && !canV) { out.push(rect); return; }

  if (canH && (!canV || rng() < 0.5)) {
    // horizontal split
    const cut = minSize + Math.floor(rng() * (rect.h - minSize * 2 - 1)) + 1;
    _split({ ...rect, h: cut },                         minSize, depth - 1, rng, out);
    _split({ ...rect, y: rect.y + cut, h: rect.h - cut }, minSize, depth - 1, rng, out);
  } else {
    // vertical split
    const cut = minSize + Math.floor(rng() * (rect.w - minSize * 2 - 1)) + 1;
    _split({ ...rect, w: cut },                         minSize, depth - 1, rng, out);
    _split({ ...rect, x: rect.x + cut, w: rect.w - cut }, minSize, depth - 1, rng, out);
  }
}

/** Shrink a BSP leaf by a margin to get the actual room rect inside the partition. */
export function leafToRoom(leaf: Rect, margin: number, minSize: number): Rect | null {
  const x = leaf.x + margin;
  const y = leaf.y + margin;
  const w = leaf.w - margin * 2;
  const h = leaf.h - margin * 2;
  if (w < minSize || h < minSize) return null;
  return { x, y, w, h };
}
