import { AnimatedSprite, Sprite } from 'pixi.js';
import type { Texture } from 'pixi.js';
import { frameTexture, sheetCols } from './Sheets';

/** Frame lists by sheet, then row, made on first use; lookups allocate nothing. */
const sequences = new Map<string, Texture[][]>();
const selected = new WeakMap<AnimatedSprite, Texture[]>();

export function animationFrames(sheet: string, row = 0): Texture[] {
  let rows = sequences.get(sheet);
  if (!rows) {
    rows = [];
    sequences.set(sheet, rows);
  }
  return rows[row] ?? (rows[row] = Array.from({ length: sheetCols(sheet) }, (_, col) => frameTexture(sheet, col, row)));
}

export function createAnimatedVisual(sheet: string, col = 0, row = 0): AnimatedSprite {
  const sprite = new AnimatedSprite({ textures: animationFrames(sheet, row), autoUpdate: false });
  setVisualFrame(sprite, sheet, col, row);
  return sprite;
}

export function setVisualFrame(sprite: Sprite, sheet: string, col: number, row = 0): void {
  if (!(sprite instanceof AnimatedSprite)) {
    sprite.texture = frameTexture(sheet, col, row);
    return;
  }
  const frames = animationFrames(sheet, row);
  if (selected.get(sprite) !== frames) {
    sprite.textures = frames;
    selected.set(sprite, frames);
  }
  sprite.gotoAndStop(Math.min(frames.length - 1, Math.max(0, col)));
}
