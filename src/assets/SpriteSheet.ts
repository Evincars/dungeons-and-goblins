import { Assets, Rectangle, Texture } from 'pixi.js';
import { registerSheet } from '../render/Sheets';
import type { SheetInfo } from '../render/Sheets';
import { context2d, createCanvas, imageOf } from '../render/canvas';
import { LoadError } from '../core/errors';
import { assetUrl } from './assetUrl';
import { setTexture } from './Textures';

export type Rect = { readonly x: number; readonly y: number; readonly w: number; readonly h: number };

/**
 * A named part of an image: one still picture, or an animation whose frames sit anywhere in the image
 * (each frame its own rect). Animations are copied into a horizontal strip, bottom-aligned and centred
 * in equal cells, so they play like any other strip.
 */
export type SheetRegion = Rect | { readonly frames: readonly Rect[] };

export type SpriteSheetOptions = {
  /** How the whole image divides into frames: strips of equal frames, one row per direction or variant. */
  grid?: SheetInfo;
  /** Parts of the image registered as sheets of their own, by texture key. */
  regions?: Readonly<Record<string, SheetRegion>>;
};

/** `count` frames of one size, `dx`/`dy` apart: an animation laid out in a row or a column. */
export function frameRun(x: number, y: number, w: number, h: number, count: number, dx: number, dy = 0): Rect[] {
  return Array.from({ length: count }, (_, i) => ({ x: x + i * dx, y: y + i * dy, w, h }));
}

function isAnimation(region: SheetRegion): region is { readonly frames: readonly Rect[] } {
  return 'frames' in region;
}

/**
 * One image under /public and how it is cut up: a frame grid over the whole image, named regions, or both.
 * Every PNG the game draws is declared as one of these, so all art is fetched, filtered and sliced the
 * same way; after `register()` each key works with `frameTexture` and the rest of `render/Sheets`.
 */
export class SpriteSheet {
  constructor(readonly key: string, readonly src: string, private readonly options: SpriteSheetOptions = {}) {}

  /** The entry Pixi's asset loader fetches. */
  get asset(): { alias: string; src: string } {
    return { alias: this.key, src: encodeURI(assetUrl(this.src)) };
  }

  /** Stores the loaded image and its regions as pixel-crisp textures and tells the sheet cache how to slice them. */
  register(): void {
    const texture = Assets.get<Texture | undefined>(this.key);
    if (!texture) throw new LoadError(`Image "${this.key}" did not load`, { context: { key: this.key, src: this.src } });
    texture.source.scaleMode = 'nearest';
    setTexture(this.key, texture);
    if (this.options.grid) registerSheet(this.key, this.options.grid);
    for (const [key, region] of Object.entries(this.options.regions ?? {})) {
      if (isAnimation(region)) this.registerStrip(key, texture, region.frames);
      else this.registerStill(key, texture, region);
    }
  }

  /** A still region shares the image's GPU source; only its frame differs. */
  private registerStill(key: string, texture: Texture, r: Rect): void {
    setTexture(key, new Texture({ source: texture.source, frame: new Rectangle(r.x, r.y, r.w, r.h) }));
    registerSheet(key, { frameWidth: r.w, frameHeight: r.h });
  }

  /** Copies scattered animation frames into one strip of equal cells, each frame standing on the cell's floor. */
  private registerStrip(key: string, texture: Texture, frames: readonly Rect[]): void {
    const image = imageOf(texture);
    if (!image) throw new LoadError(`Image "${this.key}" cannot be read`, { context: { key: this.key, region: key } });
    const cellW = Math.max(...frames.map((f) => f.w));
    const cellH = Math.max(...frames.map((f) => f.h));
    const canvas = createCanvas(cellW * frames.length, cellH);
    const ctx = context2d(canvas);
    frames.forEach((f, i) => {
      ctx.drawImage(image, f.x, f.y, f.w, f.h, i * cellW + Math.floor((cellW - f.w) / 2), cellH - f.h, f.w, f.h);
    });
    const strip = Texture.from(canvas);
    strip.source.scaleMode = 'nearest';
    setTexture(key, strip);
    registerSheet(key, { frameWidth: cellW, frameHeight: cellH });
  }
}

/** Fetches every sheet's image, then registers them all. */
export async function loadSheets(sheets: readonly SpriteSheet[]): Promise<void> {
  try {
    await Assets.load(sheets.map((sheet) => sheet.asset));
  } catch (cause) {
    throw new LoadError('Could not load the game art', { cause });
  }
  for (const sheet of sheets) sheet.register();
}
