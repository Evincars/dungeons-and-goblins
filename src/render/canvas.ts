import type { Texture } from 'pixi.js';
import { LoadError } from '../core/errors';

/** Offscreen 2-D canvases for textures built at load time (procedural art, crops, light falloffs). */

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** The canvas's 2-D context; a browser that cannot give one cannot draw the game's art at all. */
export function context2d(canvas: HTMLCanvasElement, options?: CanvasRenderingContext2DSettings): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', options);
  if (!ctx) throw new LoadError('Canvas 2D drawing is not available', { context: { width: canvas.width, height: canvas.height } });
  return ctx;
}

export function isCanvasImageSource(value: unknown): value is CanvasImageSource {
  return value instanceof HTMLImageElement || value instanceof HTMLCanvasElement || value instanceof ImageBitmap
    || (typeof OffscreenCanvas !== 'undefined' && value instanceof OffscreenCanvas)
    || value instanceof HTMLVideoElement || value instanceof SVGImageElement;
}

/** The drawable image behind a loaded texture, or null when it has none (not loaded, or GPU-only). */
export function imageOf(texture: Texture): CanvasImageSource | null {
  const resource: unknown = texture.source?.resource;
  return isCanvasImageSource(resource) ? resource : null;
}
