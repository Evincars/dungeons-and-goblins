import { BlurFilter, Container, RenderTexture, Sprite, Texture, TilingSprite } from 'pixi.js';
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
/** Newly seen ground clears the fog at most this often (ticks), so walking doesn't redraw it every frame. */
const REDRAW_TICKS = 4;
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
 * edge melts away as the party explores instead of stepping tile by tile. The seen state of every tile
 * corner is painted into a small texture, blurred once whenever it changes, and stretched over the map.
 */
export class FogRenderer {
  readonly container = new Container();
  private level: Level | null = null;
  private corners: HTMLCanvasElement | null = null;
  /** The corner pixels, kept between redraws (only their alpha changes). */
  private pixels: ImageData | null = null;
  private cornerTexture: Texture | null = null;
  private fog: RenderTexture | null = null;
  private readonly stamp = new Sprite();
  private readonly stage = new Container();
  private readonly dark = new Sprite();
  private readonly mask = new Sprite();
  private readonly mist = new Container();
  private readonly layers: TilingSprite[] = [];
  private drawnRevision = -1;
  private lastDraw = -Infinity;

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

  /** Builds the textures for a level: one texel per tile corner, and the blurred fog it becomes. */
  private prepare(level: Level): void {
    this.level = level;
    this.corners = createCanvas(level.width + 1, level.height + 1);
    this.pixels = context2d(this.corners).createImageData(level.width + 1, level.height + 1);
    this.pixels.data.fill(255);
    this.cornerTexture?.destroy(true);
    this.cornerTexture = Texture.from(this.corners);
    this.cornerTexture.source.scaleMode = 'linear';
    this.stamp.texture = this.cornerTexture;
    this.fog?.destroy(true);
    this.fog = RenderTexture.create({ width: (level.width + 1) * FOG_RES, height: (level.height + 1) * FOG_RES });
    this.fog.source.scaleMode = 'linear';
    for (const sprite of [this.dark, this.mask]) {
      sprite.texture = this.fog;
      sprite.scale.set(TILE_WIDTH / FOG_RES, TILE_HEIGHT / FOG_RES);
      // Each corner's texel centre lands on the corner itself.
      sprite.position.set(-TILE_WIDTH / 2, -TILE_HEIGHT / 2 + Y_OFFSET);
    }
    this.drawnRevision = -1;
  }

  /** Paints every unseen corner opaque, then blurs that into the fog texture. */
  private redraw(renderer: Renderer, level: Level): void {
    const pixels = this.pixels;
    if (!this.corners || !pixels || !this.cornerTexture || !this.fog) return;
    const data = pixels.data;
    for (let i = 0; i < level.seen.length; i++) data[i * 4 + 3] = level.seen[i] ? 0 : 255;
    context2d(this.corners).putImageData(pixels, 0, 0);
    this.cornerTexture.source.update();
    renderer.render({ container: this.stage, target: this.fog, clear: true });
    this.drawnRevision = level.seenRevision;
  }

  update(renderer: Renderer, level: Level, tick: number): void {
    if (this.level !== level) this.prepare(level);
    const stale = this.drawnRevision !== level.seenRevision;
    if (stale && (this.drawnRevision < 0 || tick - this.lastDraw >= REDRAW_TICKS)) {
      this.redraw(renderer, level);
      this.lastDraw = tick;
    }
    this.layers.forEach((sprite, i) => {
      const layer = MIST_LAYERS[i];
      sprite.position.set(camera.x, camera.y);
      // The sheet is drawn where the screen is; shifting its pattern back by the camera pins it to the world.
      sprite.tilePosition.set(-camera.x * layer.parallax + tick * layer.driftX, -camera.y * layer.parallax + tick * layer.driftY);
    });
  }

  destroy(): void {
    this.cornerTexture?.destroy(true);
    this.fog?.destroy(true);
    this.container.destroy({ children: true });
  }
}
