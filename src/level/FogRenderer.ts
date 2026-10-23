import { BlurFilter, BufferImageSource, Container, RenderTexture, Sprite, Texture, TilingSprite } from 'pixi.js';
import type { Renderer } from 'pixi.js';
import type { Level } from './Level';
import { TILE_WIDTH, TILE_HEIGHT } from './TileType';
import { camera, GAME_WIDTH, VIEW_HEIGHT } from '../render/Camera';
import { context2d, createCanvas } from '../render/canvas';

/** Walls are drawn taller than their tile, so the fog sits this far up to cover them. */
const Y_OFFSET = -16;
/** The fog is drawn at this many texels per tile before blurring, then stretched smoothly over the map. */
const FOG_RES = 4;
/** How far (in fog texels) the blur softens the edge between what was seen and what was not. */
const FOG_BLUR = 5;
const FOG_BLUR_QUALITY = 3;
/** The dark of the unexplored, under the mist. */
const FOG_COLOR = 0x06070b;
/** Newly seen ground clears over this many frames, a soft fade instead of tiles popping in. */
const CLEAR_FRAMES = 20;
const OPAQUE = 255;
/** Side of the tiling mist texture, the cells of its noise, and the octaves layered into it. */
const NOISE_SIZE = 128;
const NOISE_CELLS = 8;
const NOISE_OCTAVES = 3;

/** Two sheets of mist drifting over the dark at different sizes, speeds (px per tick) and depths (parallax). */
const MIST_LAYERS = [
  { scale: 2, alpha: 0.45, tint: 0x6a7484, driftX: 0.14, driftY: 0.05, parallax: 1 },
  { scale: 3.5, alpha: 0.3, tint: 0x4a5262, driftX: -0.08, driftY: 0.03, parallax: 0.85 },
] as const;

/** A seamless cloud texture: smooth value noise in white, its strength in the alpha. */
function mistTexture(): Texture {
  const canvas = createCanvas(NOISE_SIZE, NOISE_SIZE);
  const ctx = context2d(canvas);
  const image = ctx.createImageData(NOISE_SIZE, NOISE_SIZE);
  const octaves = Array.from({ length: NOISE_OCTAVES }, (_, o) => {
    const cells = NOISE_CELLS << o;
    return { cells, grid: Array.from({ length: cells * cells }, () => Math.random()) };
  });
  for (let i = 0; i < NOISE_SIZE * NOISE_SIZE; i++) {
    const value = octaves.reduce((sum, oct, o) => sum + noiseAt(oct.grid, oct.cells, i % NOISE_SIZE, Math.floor(i / NOISE_SIZE)) / (1 << o), 0);
    image.data.set([255, 255, 255, Math.round(255 * Math.min(1, value / 1.75))], i * 4);
  }
  ctx.putImageData(image, 0, 0);
  return Texture.from(canvas);
}

/** Smoothly interpolated noise at a pixel, wrapping at the edges so the texture tiles. */
function noiseAt(grid: readonly number[], cells: number, px: number, py: number): number {
  const fx = (px / NOISE_SIZE) * cells;
  const fy = (py / NOISE_SIZE) * cells;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const sx = smooth(fx - x0);
  const sy = smooth(fy - y0);
  const at = (x: number, y: number) => grid[(y % cells) * cells + (x % cells)];
  const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
  const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
  return top + (bottom - top) * sy;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

/**
 * Fog of war as fog: what nobody has seen yet lies under a soft dark with mist drifting over it, and the
 * edge melts away as the party explores instead of stepping tile by tile. Each tile corner has a fog
 * strength in a small GPU buffer; corners seen for the first time fade out over a few frames, and only while
 * something is fading is the buffer blurred again into the fog texture stretched over the map.
 */
export class FogRenderer {
  readonly container = new Container();
  private level: Level | null = null;
  /** Fog per corner, 255 (unseen) down to 0, premultiplied white so it doubles as the mask's colour. */
  private pixels: Uint8Array = new Uint8Array(0);
  private corners: BufferImageSource | null = null;
  private fog: RenderTexture | null = null;
  /** Corners whose fog is fading out (indices into the corner grid). */
  private readonly fading: number[] = [];
  private readonly stamp = new Sprite();
  private readonly stage = new Container();
  private readonly dark = new Sprite();
  private readonly mask = new Sprite();
  private readonly mist = new Container();
  private readonly layers: TilingSprite[] = [];
  private scannedRevision = -1;

  constructor() {
    this.stamp.filters = [new BlurFilter({ strength: FOG_BLUR, quality: FOG_BLUR_QUALITY })];
    this.stamp.scale.set(FOG_RES);
    this.stage.addChild(this.stamp);
    this.dark.tint = FOG_COLOR;
    const cloud = mistTexture();
    for (const layer of MIST_LAYERS) {
      const sprite = new TilingSprite({ texture: cloud, width: GAME_WIDTH, height: VIEW_HEIGHT });
      sprite.tileScale.set(layer.scale);
      sprite.tint = layer.tint;
      sprite.alpha = layer.alpha;
      this.layers.push(sprite);
      this.mist.addChild(sprite);
    }
    this.mist.mask = this.mask;
    this.container.addChild(this.dark, this.mist, this.mask);
  }

  /** Builds the textures for a level: one texel per tile corner (what is already seen starts clear), and the blurred fog. */
  private prepare(renderer: Renderer, level: Level): void {
    this.level = level;
    const w = level.width + 1;
    const h = level.height + 1;
    this.pixels = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) this.setFog(i, level.seen[i] ? 0 : OPAQUE);
    this.corners?.destroy();
    this.corners = new BufferImageSource({ resource: this.pixels, width: w, height: h, alphaMode: 'premultiplied-alpha', scaleMode: 'linear' });
    this.stamp.texture = new Texture({ source: this.corners });
    this.fog?.destroy(true);
    this.fog = RenderTexture.create({ width: w * FOG_RES, height: h * FOG_RES });
    this.fog.source.scaleMode = 'linear';
    for (const sprite of [this.dark, this.mask]) {
      sprite.texture = this.fog;
      sprite.scale.set(TILE_WIDTH / FOG_RES, TILE_HEIGHT / FOG_RES);
      // Each corner's texel centre lands on the corner itself.
      sprite.position.set(-TILE_WIDTH / 2, -TILE_HEIGHT / 2 + Y_OFFSET);
    }
    this.fading.length = 0;
    this.scannedRevision = level.seenRevision;
    this.redraw(renderer);
  }

  private setFog(corner: number, value: number): void {
    this.pixels.fill(value, corner * 4, corner * 4 + 4);
  }

  /** Corners seen since the last look start fading (those already fading or clear are left alone). */
  private queueNewlySeen(level: Level): void {
    for (let i = 0; i < level.seen.length; i++) {
      if (!level.seen[i] || this.pixels[i * 4 + 3] !== OPAQUE) continue;
      this.setFog(i, OPAQUE - 1);
      this.fading.push(i);
    }
    this.scannedRevision = level.seenRevision;
  }

  /** One frame of fading: each fading corner thins, and those that have cleared drop off the list. */
  private fadeStep(): void {
    const step = Math.ceil(OPAQUE / CLEAR_FRAMES);
    for (let i = this.fading.length - 1; i >= 0; i--) {
      const corner = this.fading[i];
      const value = Math.max(0, this.pixels[corner * 4 + 3] - step);
      this.setFog(corner, value);
      if (value > 0) continue;
      this.fading[i] = this.fading[this.fading.length - 1];
      this.fading.pop();
    }
  }

  /** Uploads the corner buffer and blurs it into the fog texture. */
  private redraw(renderer: Renderer): void {
    if (!this.corners || !this.fog) return;
    this.corners.update();
    renderer.render({ container: this.stage, target: this.fog, clear: true });
  }

  update(renderer: Renderer, level: Level, tick: number): void {
    if (this.level !== level) this.prepare(renderer, level);
    if (this.scannedRevision !== level.seenRevision) this.queueNewlySeen(level);
    if (this.fading.length) {
      this.fadeStep();
      this.redraw(renderer);
    }
    this.layers.forEach((sprite, i) => {
      const layer = MIST_LAYERS[i];
      sprite.position.set(camera.x, camera.y);
      // The sheet is drawn where the screen is; shifting its pattern back by the camera pins it to the world.
      sprite.tilePosition.set(-camera.x * layer.parallax + tick * layer.driftX, -camera.y * layer.parallax + tick * layer.driftY);
    });
  }

  destroy(): void {
    this.corners?.destroy();
    this.fog?.destroy(true);
    this.container.destroy({ children: true });
  }
}
