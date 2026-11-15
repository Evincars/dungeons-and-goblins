import type { Particle } from 'pixi.js';
import type { StaticTileLayer } from './StaticTileLayer';

/**
 * Walls that turn see-through over whoever stands behind them, as in the isometric RPGs: the dark of a room's south
 * wall that feet sink into, the faces and slanted faces drawn in front of someone, the void over a chasm's edge. Their
 * rims (TerrainPiece.edge) stay solid, so the wall's outline still shows. Each such piece of terrain is a pane: its
 * particle, the batch it lies in, the depth it is drawn at and its box, filed by the cells of a coarse grid it covers so
 * a figure finds the panes over it without scanning them all. A pane fades to SEE_THROUGH_ALPHA while it covers a figure
 * it is drawn in front of, and back when none is behind it, a little each frame.
 */

/** How solid a wall stays while someone is behind it, and how much of the way it fades (in or out) each frame. */
const SEE_THROUGH_ALPHA = 0.35;
const FADE_STEP = 0.1;
/** Panes are filed by grid cells this many pixels square. */
const CELL = 32;

type Pane = {
  particle: Particle;
  layer: StaticTileLayer;
  z: number;
  x0: number; y0: number; x1: number; y1: number;
  /** The frame a figure was last behind it. */
  covered: number;
};

export class SeeThroughWalls {
  private readonly cells = new Map<number, Pane[]>();
  /** Panes not wholly solid, or about to fade: the only ones each frame eases. */
  private readonly fading = new Set<Pane>();
  /** Batches whose panes changed this frame, to be re-uploaded once. */
  private readonly changed = new Set<StaticTileLayer>();
  private readonly columns: number;
  private frame = 0;

  /** For a level `width` pixels across. */
  constructor(width: number) {
    this.columns = Math.ceil(width / CELL) + 1;
  }

  /** Files a piece of wall drawn at depth z over the box (x, y, w, h) as a pane that can turn see-through. */
  add(particle: Particle, layer: StaticTileLayer, z: number, x: number, y: number, w: number, h: number): void {
    const pane: Pane = { particle, layer, z, x0: x, y0: y, x1: x + w, y1: y + h, covered: -1 };
    for (let cy = Math.floor(pane.y0 / CELL); cy * CELL < pane.y1; cy++) {
      for (let cx = Math.floor(pane.x0 / CELL); cx * CELL < pane.x1; cx++) this.file(cx, cy, pane);
    }
  }

  private file(cx: number, cy: number, pane: Pane): void {
    const key = this.key(cx, cy);
    const list = this.cells.get(key);
    if (list) list.push(pane);
    else this.cells.set(key, [pane]);
  }

  private key(cx: number, cy: number): number {
    return cy * this.columns + cx;
  }

  /** Starts a frame: the figures to see through to follow (reveal), then settle. */
  begin(): void {
    this.frame++;
  }

  /** A figure over the box (x0, y0)–(x1, y1), its feet at feetY: every pane drawn in front of it and over it fades. */
  reveal(x0: number, y0: number, x1: number, y1: number, feetY: number): void {
    for (let cy = Math.floor(y0 / CELL); cy * CELL < y1; cy++) {
      for (let cx = Math.floor(x0 / CELL); cx * CELL < x1; cx++) this.revealIn(this.cells.get(this.key(cx, cy)), x0, y0, x1, y1, feetY);
    }
  }

  private revealIn(panes: Pane[] | undefined, x0: number, y0: number, x1: number, y1: number, feetY: number): void {
    if (!panes) return;
    for (const pane of panes) {
      const over = pane.z > feetY && pane.x0 < x1 && pane.x1 > x0 && pane.y0 < y1 && pane.y1 > y0;
      if (!over) continue;
      pane.covered = this.frame;
      this.fading.add(pane);
    }
  }

  /** Eases every pane toward see-through (someone behind it this frame) or solid, and re-uploads the batches that changed. */
  settle(): void {
    for (const pane of this.fading) this.ease(pane);
    for (const layer of this.changed) layer.refresh();
    this.changed.clear();
  }

  private ease(pane: Pane): void {
    const target = pane.covered === this.frame ? SEE_THROUGH_ALPHA : 1;
    const { particle } = pane;
    const alpha = particle.alpha < target ? Math.min(target, particle.alpha + FADE_STEP) : Math.max(target, particle.alpha - FADE_STEP);
    if (alpha !== particle.alpha) {
      particle.alpha = alpha;
      this.changed.add(pane.layer);
    }
    if (alpha === 1) this.fading.delete(pane);
  }
}
