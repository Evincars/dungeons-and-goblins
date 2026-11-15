import { Rectangle, Texture } from 'pixi.js';
import { getTexture } from '../assets/Textures';
import { context2d, createCanvas, imageOf } from './canvas';
import { MINE_GROUND, MINE_GROUND_BLOCKS } from '../level/MineTiles';
import { NOISE_PERIOD, overlayCovers } from '../level/MineGround';
import type { MineGroundOverlay } from '../level/MineGround';

/**
 * The cuts of the mines' tones of earth where they meet (level/MineGround.ts), baked once into one atlas image: a cell's
 * worth of a tone's ground, cleared outside its ragged edge, the pixels along the edge a shade darker (as the set's own
 * patches of earth are). Every level reuses the cells already baked, and all of them come from one texture, so the
 * terrain draws them as a single batch.
 */

const CELL = 32;
const COLS = 32;
const ROWS = 32;
/** The pixels of a tone along its edge are darkened to this share, so the edge reads as earth lying over earth. */
const EDGE_SHADE = 0.8;

type Atlas = { canvas: HTMLCanvasElement; texture: Texture; cells: Map<string, Rectangle | null>; quarters: Map<string, Texture>; used: number; dirty: boolean };
let atlas: Atlas | null = null;

function theAtlas(): Atlas {
  if (atlas) return atlas;
  const canvas = createCanvas(COLS * CELL, ROWS * CELL);
  atlas = { canvas, texture: Texture.from(canvas), cells: new Map(), quarters: new Map(), used: 0, dirty: false };
  return atlas;
}

/**
 * A cell's worth of a tone's ground (from where the cell lies in the ground's period), drawn at (cx, cy): in up to four
 * parts where the cell runs over the end of the ground's seamless block.
 */
function drawGround(ctx: CanvasRenderingContext2D, image: CanvasImageSource, o: MineGroundOverlay, cx: number, cy: number): void {
  const block = MINE_GROUND_BLOCKS[o.tone] ?? MINE_GROUND_BLOCKS[0];
  for (let y = 0; y < CELL; y = Math.min(CELL, y + NOISE_PERIOD - ((o.py + y) % NOISE_PERIOD))) {
    const h = Math.min(CELL - y, NOISE_PERIOD - ((o.py + y) % NOISE_PERIOD));
    for (let x = 0; x < CELL; x = Math.min(CELL, x + NOISE_PERIOD - ((o.px + x) % NOISE_PERIOD))) {
      const w = Math.min(CELL - x, NOISE_PERIOD - ((o.px + x) % NOISE_PERIOD));
      ctx.drawImage(image, block.x + ((o.px + x) % NOISE_PERIOD), block.y + ((o.py + y) % NOISE_PERIOD), w, h, cx + x, cy + y, w, h);
    }
  }
}

/** Clears a baked cell outside its tone's edge and shades the pixels along it. */
function cutCell(data: Uint8ClampedArray, o: MineGroundOverlay): void {
  for (let i = 0; i < CELL * CELL; i++) {
    const x = i % CELL;
    const y = Math.floor(i / CELL);
    if (!overlayCovers(o.corners, o.px, o.py, x, y)) {
      data[i * 4 + 3] = 0;
      continue;
    }
    if (onEdge(o, x, y)) shade(data, i);
  }
}

/** Whether a covered pixel has an uncovered one beside it. */
function onEdge(o: MineGroundOverlay, x: number, y: number): boolean {
  return !overlayCovers(o.corners, o.px, o.py, x - 1, y) || !overlayCovers(o.corners, o.px, o.py, x + 1, y)
    || !overlayCovers(o.corners, o.px, o.py, x, y - 1) || !overlayCovers(o.corners, o.px, o.py, x, y + 1);
}

function shade(data: Uint8ClampedArray, i: number): void {
  for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.round(data[i * 4 + c] * EDGE_SHADE);
}

/** Bakes one cell into the next free place; null when the ground's image isn't there or the atlas is full. */
function bake(a: Atlas, o: MineGroundOverlay): Rectangle | null {
  const image = imageOf(getTexture(MINE_GROUND));
  if (!image || a.used >= COLS * ROWS) return null;
  const cx = (a.used % COLS) * CELL;
  const cy = Math.floor(a.used / COLS) * CELL;
  const ctx = context2d(a.canvas, { willReadFrequently: true });
  drawGround(ctx, image, o, cx, cy);
  const pixels = ctx.getImageData(cx, cy, CELL, CELL);
  cutCell(pixels.data, o);
  ctx.putImageData(pixels, cx, cy);
  a.used++;
  a.dirty = true;
  return new Rectangle(cx, cy, CELL, CELL);
}

/** The texture of an overlay's quarter (its cell baked the first time any level needs it); empty if it can't be made. */
export function mineOverlayTexture(o: MineGroundOverlay): Texture {
  const a = theAtlas();
  const cellKey = `${o.tone}:${o.corners}:${o.px}:${o.py}`;
  const key = `${cellKey}:${o.sx}:${o.sy}`;
  const known = a.quarters.get(key);
  if (known) return known;
  if (!a.cells.has(cellKey)) a.cells.set(cellKey, bake(a, o));
  const cell = a.cells.get(cellKey);
  const texture = cell ? new Texture({ source: a.texture.source, frame: new Rectangle(cell.x + o.sx, cell.y + o.sy, o.w, o.h) }) : Texture.EMPTY;
  a.quarters.set(key, texture);
  return texture;
}

/** Sends newly baked cells to the GPU (once, after a level's terrain has been built). */
export function commitMineGroundAtlas(): void {
  if (!atlas?.dirty) return;
  atlas.texture.source.update();
  atlas.dirty = false;
}
