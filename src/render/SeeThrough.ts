import type { Container, Filter } from 'pixi.js';
import { MAX_REVEALS, RevealFilter } from './RevealFilter';

/**
 * Walls and tall things that clear over whoever stands behind them, as in the isometric RPGs: the dark of a room's
 * south wall feet sink into, the faces drawn in front of someone, a column or a rock. Each is a screen: something drawn
 * at a depth that can be cleared (a batch of wall pieces sorted at one depth, a column's sprite). A figure behind a
 * screen (its feet north of the screen's depth, its body under the screen's art) gets a soft ellipse cleared in it
 * (RevealFilter), which follows it smoothly and eases in when it steps behind and out when it leaves.
 */

/** Something drawn over whoever stands behind it that can be cleared over them. */
export type Screen = {
  target: Container;
  /** The depth it is drawn at (the feet it stands in front of are north of this). */
  z: number;
  filter: Slots | null;
  /** The ellipses cleared in it this frame. */
  reveals: Reveal[];
};

/** What clears the ellipses in a screen: a RevealFilter (a stand-in where nothing is drawn, as in the tests). */
export type Slots = Filter & { reset(): void; set(i: number, x: number, y: number, rx: number, ry: number, strength: number): void; commit(): void };

/** A figure's ellipse: where (world px), how big, how far cleared, and the screens it is cleared in. */
type Reveal = { x: number; y: number; rx: number; ry: number; strength: number; seen: number; screens: Screen[] };

/** How much of the way an ellipse clears, or fills back, each frame. */
const EASE_IN = 0.1;
const EASE_OUT = 0.07;
/** Screen boxes are filed by grid cells this many pixels square. */
const CELL = 32;

/** A screen's box, filed in the cells it covers. */
type Pane = { screen: Screen; x0: number; y0: number; x1: number; y1: number };

/**
 * The screens of a level's walls (its batches of wall pieces at each depth), filed by the cells of a coarse grid each
 * piece covers, so a figure finds the ones over it without scanning them all.
 */
export class SeeThroughWalls {
  private readonly cells = new Map<number, Pane[]>();
  private readonly screens = new Map<Container, Screen>();
  private readonly columns: number;

  /** For a level `width` pixels across. */
  constructor(width: number) {
    this.columns = Math.ceil(width / CELL) + 1;
  }

  /** A piece of `target` (a batch of walls drawn at depth z) over the box (x, y, w, h). */
  addPiece(target: Container, z: number, x: number, y: number, w: number, h: number): void {
    let screen = this.screens.get(target);
    if (!screen) {
      screen = { target, z, filter: null, reveals: [] };
      this.screens.set(target, screen);
    }
    fileBox(this.cells, this.columns, { screen, x0: x, y0: y, x1: x + w, y1: y + h });
  }

  /** Every screen drawn in front of feet at feetY and over the box (x0, y0)–(x1, y1), added to `out` once. */
  collect(x0: number, y0: number, x1: number, y1: number, feetY: number, out: Screen[]): void {
    collectIn(this.cells, this.columns, x0, y0, x1, y1, feetY, out);
  }
}

/** Files a pane in every cell its box covers. */
export function fileBox(cells: Map<number, Pane[]>, columns: number, pane: Pane): void {
  for (let cy = Math.floor(pane.y0 / CELL); cy * CELL < pane.y1; cy++) {
    for (let cx = Math.floor(pane.x0 / CELL); cx * CELL < pane.x1; cx++) fileIn(cells, cy * columns + cx, pane);
  }
}

function fileIn(cells: Map<number, Pane[]>, key: number, pane: Pane): void {
  const list = cells.get(key);
  if (list) list.push(pane);
  else cells.set(key, [pane]);
}

/** Every screen of the filed panes in front of feet at feetY and over the box, added to `out` once. */
export function collectIn(
  cells: Map<number, Pane[]>, columns: number, x0: number, y0: number, x1: number, y1: number, feetY: number, out: Screen[],
): void {
  for (let cy = Math.floor(y0 / CELL); cy * CELL < y1; cy++) {
    for (let cx = Math.floor(x0 / CELL); cx * CELL < x1; cx++) collectCell(cells.get(cy * columns + cx), x0, y0, x1, y1, feetY, out);
  }
}

function collectCell(panes: Pane[] | undefined, x0: number, y0: number, x1: number, y1: number, feetY: number, out: Screen[]): void {
  if (!panes) return;
  for (const pane of panes) {
    const over = pane.screen.z > feetY && pane.x0 < x1 && pane.x1 > x0 && pane.y0 < y1 && pane.y1 > y0;
    if (over && !out.includes(pane.screen)) out.push(pane.screen);
  }
}

/** Where on screen a world point lands: the game layer's scale and offset (it is never rotated). */
export type ScreenTransform = { a: number; d: number; tx: number; ty: number };

/**
 * The figures' ellipses: each eases in while its figure stands behind something and out once it has left (or is
 * gone), and every screen with an ellipse in it gets the filter that clears them.
 */
export class Revealer {
  private readonly reveals = new Map<object, Reveal>();
  /** Screens with a filter on them. */
  private readonly live = new Set<Screen>();
  private frame = 0;

  /** `makeFilter` makes the filter a screen is cleared with (a RevealFilter). */
  constructor(private readonly makeFilter: () => Slots = () => new RevealFilter()) {}

  /** Starts a frame: the figures follow (figure), then settle. */
  begin(): void {
    this.frame++;
  }

  /**
   * A figure (`key` its entity) with its ellipse at (x, y), radii rx and ry, and the screens it stands behind this frame
   * (none: it eases back out of the ones it was behind).
   */
  figure(key: object, x: number, y: number, rx: number, ry: number, screens: readonly Screen[]): void {
    let reveal = this.reveals.get(key);
    if (!reveal && screens.length === 0) return;
    if (!reveal) {
      reveal = { x, y, rx, ry, strength: 0, seen: -1, screens: [] };
      this.reveals.set(key, reveal);
    }
    reveal.x = x;
    reveal.y = y;
    reveal.rx = rx;
    reveal.ry = ry;
    if (screens.length === 0) return;
    reveal.seen = this.frame;
    reveal.screens.length = 0;
    for (const screen of screens) reveal.screens.push(screen);
  }

  /** Eases every ellipse and sets the filters of the screens they are in, on screen through `view`. */
  settle(view: ScreenTransform): void {
    for (const screen of this.live) screen.reveals.length = 0;
    for (const [key, reveal] of this.reveals) this.ease(key, reveal);
    for (const screen of this.live) this.apply(screen, view);
  }

  /** Forgets every ellipse and filter (the level's walls were built anew; the old ones are gone). */
  clear(): void {
    for (const screen of this.live) if (!screen.target.destroyed) screen.target.filters = null;
    this.live.clear();
    this.reveals.clear();
  }

  private ease(key: object, reveal: Reveal): void {
    const behind = reveal.seen === this.frame;
    reveal.strength = behind ? Math.min(1, reveal.strength + EASE_IN) : Math.max(0, reveal.strength - EASE_OUT);
    if (reveal.strength === 0 && !behind) {
      this.reveals.delete(key);
      return;
    }
    for (const screen of reveal.screens) {
      screen.reveals.push(reveal);
      this.live.add(screen);
    }
  }

  private apply(screen: Screen, view: ScreenTransform): void {
    const { target } = screen;
    if (screen.reveals.length === 0 || target.destroyed) {
      if (!target.destroyed) target.filters = null;
      this.live.delete(screen);
      return;
    }
    const filter = screen.filter ?? (screen.filter = this.makeFilter());
    filter.reset();
    const count = Math.min(MAX_REVEALS, screen.reveals.length);
    for (let i = 0; i < count; i++) {
      const r = screen.reveals[i];
      filter.set(i, r.x * view.a + view.tx, r.y * view.d + view.ty, r.rx * view.a, r.ry * view.d, r.strength);
    }
    filter.commit();
    if (target.filters?.[0] !== filter) target.filters = [filter];
  }
}
