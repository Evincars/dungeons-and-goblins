import { Rectangle, Texture } from 'pixi.js';
import { getTexture } from '../assets/Textures';
import { context2d, createCanvas, imageOf } from './canvas';
import type { BlendSide, GroundBlend } from '../level/GroundBlend';

/**
 * The fades of ground spilling over a tile edge (level/GroundBlend.ts), baked once into one atlas image: the
 * neighbour's own 32×32 texture with a dithered alpha ramp toward the far side. Every level reuses the
 * fades already baked, and all of them come from one texture, so the terrain draws them as a single batch.
 */

const CELL = 32;
const COLS = 32;
const ROWS = 16;
/** How far (px) the spill reaches into the tile, and how much its edge wanders so it isn't ruler-straight. */
const FADE_DEPTH = 13;
const WOBBLE = 3;
/** The fade is dithered (ordered 4×4 Bayer) so it stays crisp pixel art instead of turning see-through. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;
const BAYER_LEVELS = 16;
/** Ramps ease out a little, so the ground stays solid near the edge it comes from. */
const RAMP_EASE = 0.75;

type Atlas = { canvas: HTMLCanvasElement; texture: Texture; cells: Map<string, Texture>; used: number; dirty: boolean };
let atlas: Atlas | null = null;

function theAtlas(): Atlas {
  if (atlas) return atlas;
  const canvas = createCanvas(COLS * CELL, ROWS * CELL);
  atlas = { canvas, texture: Texture.from(canvas), cells: new Map(), used: 0, dirty: false };
  return atlas;
}

/** How far into the tile pixel (x, y) is from the side the ground spills from (a corner: from that corner). */
function depthFrom(side: BlendSide, x: number, y: number): number {
  const fromN = y + 0.5;
  const fromS = CELL - 0.5 - y;
  const fromW = x + 0.5;
  const fromE = CELL - 0.5 - x;
  switch (side) {
    case 'n': return fromN;
    case 's': return fromS;
    case 'w': return fromW;
    case 'e': return fromE;
    case 'ne': return Math.hypot(fromN, fromE);
    case 'nw': return Math.hypot(fromN, fromW);
    case 'se': return Math.hypot(fromS, fromE);
    default: return Math.hypot(fromS, fromW);
  }
}

/** The reach of the spill at this point along its edge: the fade depth, wandering by a smooth few pixels. */
function reachAt(side: BlendSide, x: number, y: number): number {
  const along = side === 'n' || side === 's' ? x : y;
  return FADE_DEPTH + WOBBLE * Math.sin(along * 0.55 + side.length) * Math.cos(along * 0.23);
}

/** Keeps a pixel of the spilled ground where its dithered ramp says so, clears it elsewhere. */
function maskCell(data: Uint8ClampedArray, side: BlendSide): void {
  for (let i = 0; i < CELL * CELL; i++) {
    const x = i % CELL;
    const y = Math.floor(i / CELL);
    const cover = Math.max(0, 1 - depthFrom(side, x, y) / reachAt(side, x, y)) ** RAMP_EASE;
    if (cover * BAYER_LEVELS <= BAYER[(y % 4) * 4 + (x % 4)]) data[i * 4 + 3] = 0;
  }
}

/** Bakes one fade into the next free cell; null when its ground's image isn't there or the atlas is full. */
function bake(a: Atlas, blend: GroundBlend): Texture | null {
  const image = imageOf(getTexture(blend.from.sheet ?? 'tileset'));
  if (!image || a.used >= COLS * ROWS) return null;
  const cx = (a.used % COLS) * CELL;
  const cy = Math.floor(a.used / COLS) * CELL;
  const ctx = context2d(a.canvas, { willReadFrequently: true });
  ctx.drawImage(image, blend.from.sx, blend.from.sy, CELL, CELL, cx, cy, CELL, CELL);
  const pixels = ctx.getImageData(cx, cy, CELL, CELL);
  maskCell(pixels.data, blend.side);
  ctx.putImageData(pixels, cx, cy);
  a.used++;
  a.dirty = true;
  return new Texture({ source: a.texture.source, frame: new Rectangle(cx, cy, CELL, CELL) });
}

/** The texture of a blend (baked the first time any level needs it); empty if it can't be made. */
export function blendTexture(blend: GroundBlend): Texture {
  const a = theAtlas();
  const key = `${blend.from.sheet ?? 'tileset'}:${blend.from.sx}:${blend.from.sy}:${blend.side}`;
  let texture = a.cells.get(key);
  if (!texture) {
    texture = bake(a, blend) ?? Texture.EMPTY;
    a.cells.set(key, texture);
  }
  return texture;
}

/** Sends newly baked fades to the GPU (once, after a level's terrain has been built). */
export function commitBlendAtlas(): void {
  if (!atlas?.dirty) return;
  atlas.texture.source.update();
  atlas.dirty = false;
}
