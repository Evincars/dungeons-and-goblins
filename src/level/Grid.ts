/**
 * Row-by-row walks over a rectangle of tile coordinates (both corners inclusive), so callers keep their
 * per-tile logic flat instead of nesting it inside two loops.
 */
export function forEachTile(x0: number, y0: number, x1: number, y1: number, visit: (tx: number, ty: number) => void): void {
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) visit(tx, ty);
  }
}

/** The first tile of the rectangle, row by row, for which `test` holds; null when none does. */
export function firstTile(
  x0: number, y0: number, x1: number, y1: number, test: (tx: number, ty: number) => boolean,
): { x: number; y: number } | null {
  const width = x1 - x0 + 1;
  const count = width > 0 && y1 >= y0 ? width * (y1 - y0 + 1) : 0;
  for (let i = 0; i < count; i++) {
    const tx = x0 + (i % width);
    const ty = y0 + Math.floor(i / width);
    if (test(tx, ty)) return { x: tx, y: ty };
  }
  return null;
}

/** Whether `test` holds for any tile of the rectangle; stops at the first that does. */
export function someTile(x0: number, y0: number, x1: number, y1: number, test: (tx: number, ty: number) => boolean): boolean {
  const width = x1 - x0 + 1;
  const count = width > 0 && y1 >= y0 ? width * (y1 - y0 + 1) : 0;
  for (let i = 0; i < count; i++) if (test(x0 + (i % width), y0 + Math.floor(i / width))) return true;
  return false;
}
