import { Container, Sprite, Texture } from 'pixi.js';
import { world } from '../world';
import type { Entity } from '../world';
import { createCanvas, context2d } from '../render/canvas';

/**
 * The body of a Fog Cloud and of Darkness (systems/FogCloud.ts), drawn on every screen from the world: two layers of rolling
 * cloud over the sphere, each a disc of soft noise thick at its rim and thin in its middle (so the fight inside shows through
 * the fog), turning slowly the opposite ways and breathing, with its wisps (systems/VfxSystem.ts) drifting over them. Fog is
 * pale grey; Darkness is black and denser, swallowing the light (the light overlay leaves out what shines inside it). Drawn
 * over everyone in the cloud, as fog lies over a fight. Pooled, one pair of layers per cloud.
 */

/** The cloud's art is made this many px across a unit of its radius (finer is costlier), with noise in cells this big. */
const NOISE_CELL = 10;
/** How thick the cloud is from its middle out: thin in the middle, thickest near the rim, fading out at the edge. */
const MIDDLE_ALPHA = 0.28;
const RIM_ALPHA = 1;
const RIM_AT = 0.82;
/** Noise thins the cloud to this share at its thinnest. */
const NOISE_FLOOR = 0.35;
/** Fog's and Darkness's colours and how dense each is at its thickest. */
const FOG_COLOUR = 0xd8dde6;
const FOG_ALPHA = 0.5;
const DARK_COLOUR = 0x07050c;
const DARK_ALPHA = 0.88;
/** The layers turn this fast (radians a frame, the second the other way and slower), and breathe a breath this many frames long. */
const TURN = 0.0016;
const SECOND_TURN = -0.0011;
const BREATH_FRAMES = 240;
const BREATH = 0.12;
/** The second layer is a little wider and fainter. */
const SECOND_SCALE = 1.08;
const SECOND_ALPHA = 0.7;
/** Each cloud's art is seeded by its radius, so the same size looks the same on every screen. */
const SEED = 7919;

const clouds = world.with('position', 'fogCloud');
type Layers = { holder: Container; first: Sprite; second: Sprite };
const shown = new Map<Entity, Layers>();
const textures = new Map<number, Texture>();
let frame = 0;

/** A small seeded random (the same art everywhere). */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Smooth value noise over a grid of `cells` × `cells` random values, at a share (0–1) across and down. */
function noise(grid: readonly number[], cells: number, u: number, v: number): number {
  const x = u * (cells - 1);
  const y = v * (cells - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(cells - 1, x0 + 1);
  const y1 = Math.min(cells - 1, y0 + 1);
  const sx = (x - x0) * (x - x0) * (3 - 2 * (x - x0));
  const sy = (y - y0) * (y - y0) * (3 - 2 * (y - y0));
  const top = grid[y0 * cells + x0] * (1 - sx) + grid[y0 * cells + x1] * sx;
  const bottom = grid[y1 * cells + x0] * (1 - sx) + grid[y1 * cells + x1] * sx;
  return top * (1 - sy) + bottom * sy;
}

/** How thick the cloud is at a share `d` (0 middle, 1 edge) of its radius. */
function profile(d: number): number {
  if (d >= 1) return 0;
  if (d <= RIM_AT) return MIDDLE_ALPHA + (RIM_ALPHA - MIDDLE_ALPHA) * (d / RIM_AT) ** 2;
  return RIM_ALPHA * (1 - (d - RIM_AT) / (1 - RIM_AT));
}

/** The cloud's art for a radius: white soft noise in a disc, its thickness in the alpha (tinted for fog or Darkness). */
function cloudTexture(radius: number): Texture {
  const have = textures.get(radius);
  if (have) return have;
  const size = Math.max(8, Math.round(radius * 2));
  const cells = Math.max(3, Math.round(size / NOISE_CELL));
  const random = seeded(SEED + radius);
  const coarse = Array.from({ length: cells * cells }, random);
  const fine = Array.from({ length: cells * 2 * cells * 2 }, random);
  const canvas = createCanvas(size, size);
  const ctx = context2d(canvas);
  const image = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const px = i % size;
    const py = Math.floor(i / size);
    const d = Math.hypot(px - size / 2, py - size / 2) / (size / 2);
    const n = 0.65 * noise(coarse, cells, px / size, py / size) + 0.35 * noise(fine, cells * 2, px / size, py / size);
    const alpha = profile(d) * (NOISE_FLOOR + (1 - NOISE_FLOOR) * n);
    image.data[i * 4] = image.data[i * 4 + 1] = image.data[i * 4 + 2] = 255;
    image.data[i * 4 + 3] = Math.round(alpha * 255);
  }
  ctx.putImageData(image, 0, 0);
  const texture = Texture.from(canvas);
  textures.set(radius, texture);
  return texture;
}

/** A cloud's two layers, made the first time it is seen (again on a new level's layer). */
function layersOf(cloud: Entity, radius: number, gameLayer: Container): Layers {
  const have = shown.get(cloud);
  if (have && !have.holder.destroyed && have.holder.parent === gameLayer) return have;
  const holder = new Container();
  const art = cloudTexture(Math.round(radius));
  const first = new Sprite(art);
  const second = new Sprite(art);
  first.anchor.set(0.5);
  second.anchor.set(0.5);
  second.scale.set(SECOND_SCALE);
  holder.addChild(second, first);
  gameLayer.addChild(holder);
  const layers = { holder, first, second };
  shown.set(cloud, layers);
  return layers;
}

/** Clouds that are gone (lifted, scattered, or left on another level) are dropped. */
function dropGone(gameLayer: Container): void {
  for (const [cloud, layers] of shown) {
    if (world.id(cloud) !== undefined && !cloud.removed && layers.holder.parent === gameLayer) continue;
    layers.holder.destroy({ children: true });
    shown.delete(cloud);
  }
}

/** Once a frame: every fog cloud and Darkness drawn over the floor it covers, rolling and breathing. */
export function updateClouds(gameLayer: Container): void {
  frame++;
  dropGone(gameLayer);
  const breath = 1 + BREATH * Math.sin((frame / BREATH_FRAMES) * Math.PI * 2);
  for (const cloud of clouds) {
    if (cloud.removed) continue;
    const { radius, dark } = cloud.fogCloud;
    const layers = layersOf(cloud, radius, gameLayer);
    const colour = dark ? DARK_COLOUR : FOG_COLOUR;
    const alpha = (dark ? DARK_ALPHA : FOG_ALPHA) * breath;
    layers.holder.position.set(Math.round(cloud.position.x), Math.round(cloud.position.y));
    // Over everyone in it: the cloud lies over the fight.
    layers.holder.zIndex = cloud.position.y + radius;
    layers.first.tint = colour;
    layers.second.tint = colour;
    layers.first.alpha = Math.min(1, alpha);
    layers.second.alpha = Math.min(1, alpha * SECOND_ALPHA);
    layers.first.rotation = frame * TURN;
    layers.second.rotation = frame * SECOND_TURN;
  }
}
