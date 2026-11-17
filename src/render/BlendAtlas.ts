import { Rectangle, Texture } from 'pixi.js';
import { getTexture } from '../assets/Textures';
import { context2d, createCanvas, imageOf } from './canvas';
import { blendCovers } from '../level/GroundBlend';
import type { BlendSide, GroundBlend } from '../level/GroundBlend';

/**
 * The cuts of ground spilling over a tile edge (level/GroundBlend.ts), baked once into one atlas image: the neighbour's
 * own 32×32 texture, kept where its ragged line says (blendCovers) and cleared beyond, one cut per side and place along
 * the line's period. Every level reuses the cuts already baked, and all of them come from one texture, so the terrain
 * draws them as a single batch.
 */

const CELL = 32;
const COLS = 32;
const ROWS = 32;

type Atlas = { canvas: HTMLCanvasElement; texture: Texture; cells: Map<string, Texture>; used: number; dirty: boolean };
let atlas: Atlas | null = null;

function theAtlas(): Atlas {
  if (atlas) return atlas;
  const canvas = createCanvas(COLS * CELL, ROWS * CELL);
  atlas = { canvas, texture: Texture.from(canvas), cells: new Map(), used: 0, dirty: false };
  return atlas;
}

/** Keeps a pixel of the spilled ground where its ragged line covers it, clears it elsewhere. */
function maskCell(data: Uint8ClampedArray, side: BlendSide, variant: number): void {
  for (let i = 0; i < CELL * CELL; i++) {
    if (!blendCovers(side, variant, i % CELL, Math.floor(i / CELL))) data[i * 4 + 3] = 0;
  }
}

/** Bakes one cut into the next free cell; null when its ground's image isn't there or the atlas is full. */
function bake(a: Atlas, blend: GroundBlend): Texture | null {
  const image = imageOf(getTexture(blend.from.sheet ?? 'tileset'));
  if (!image || a.used >= COLS * ROWS) return null;
  const cx = (a.used % COLS) * CELL;
  const cy = Math.floor(a.used / COLS) * CELL;
  const ctx = context2d(a.canvas, { willReadFrequently: true });
  ctx.drawImage(image, blend.from.sx, blend.from.sy, CELL, CELL, cx, cy, CELL, CELL);
  const pixels = ctx.getImageData(cx, cy, CELL, CELL);
  maskCell(pixels.data, blend.side, blend.variant);
  ctx.putImageData(pixels, cx, cy);
  a.used++;
  a.dirty = true;
  return new Texture({ source: a.texture.source, frame: new Rectangle(cx, cy, CELL, CELL) });
}

/** The texture of a blend (baked the first time any level needs it); empty if it can't be made. */
export function blendTexture(blend: GroundBlend): Texture {
  const a = theAtlas();
  const key = `${blend.from.sheet ?? 'tileset'}:${blend.from.sx}:${blend.from.sy}:${blend.side}:${blend.variant}`;
  let texture = a.cells.get(key);
  if (!texture) {
    texture = bake(a, blend) ?? Texture.EMPTY;
    a.cells.set(key, texture);
  }
  return texture;
}

/** Sends newly baked cuts to the GPU (once, after a level's terrain has been built). */
export function commitBlendAtlas(): void {
  if (!atlas?.dirty) return;
  atlas.texture.source.update();
  atlas.dirty = false;
}
