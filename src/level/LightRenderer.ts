import { Container, Graphics, RenderTexture, Sprite, Texture } from 'pixi.js';
import type { Application } from 'pixi.js';
import { GAME_WIDTH, VIEW_HEIGHT, camera } from '../render/Camera';
import { context2d, createCanvas } from '../render/canvas';

const FLICKER_SPEED = 0.05;
/**
 * A flame breathes: its reach swells and shrinks by up to these shares of its radius on three out-of-step waves (a slow
 * sway, a flutter and a quick shiver), so no two flames, nor two moments of one, look alike.
 */
const FLICKER_SWAY = 0.06;
const FLICKER_FLUTTER = 0.05;
const FLICKER_SHIVER = 0.03;
/** Frequencies of those waves. */
const FLICKER_SLOW = 1.3;
const FLICKER_FAST = 3.7;
const FLICKER_FASTER = 7.1;
/** And its brightness dips with them, to as low as this share of full (a gust bending the flame). */
const FLICKER_DIM = 0.72;
const MIN_FLICKER_RADIUS = 20;
/**
 * Light level everywhere before torches and lanterns add to it (multiplied over the scene): dim, so the dungeon is dark
 * beyond the flames but its walls and floors can still be made out.
 */
const AMBIENT = 0x6a6676;

/** Cached Pixi Textures keyed by radius (positive = warm, negative = cold); a flickering light scales its own. */
const lightTexCache = new Map<number, Texture>();

function makeLightTexture(radius: number, warm: boolean): Texture {
  const size = radius * 2;
  const c = createCanvas(size, size);
  const ctx = context2d(c);
  const grad = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
  if (warm) {
    grad.addColorStop(0,   'rgba(255, 220, 160, 1.0)');
    grad.addColorStop(0.3, 'rgba(255, 180, 80,  0.7)');
    grad.addColorStop(0.7, 'rgba(200, 100, 20,  0.2)');
    grad.addColorStop(1.0, 'rgba(0,   0,   0,   0.0)');
  } else {
    grad.addColorStop(0,   'rgba(220, 230, 255, 0.9)');
    grad.addColorStop(0.4, 'rgba(160, 180, 255, 0.5)');
    grad.addColorStop(0.8, 'rgba(80,  80,  160, 0.1)');
    grad.addColorStop(1.0, 'rgba(0,   0,   0,   0.0)');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return Texture.from(c);
}

function getLightTexture(radius: number, warm: boolean): Texture {
  const key = warm ? radius : -radius;
  let tex = lightTexCache.get(key);
  if (!tex) {
    tex = makeLightTexture(radius, warm);
    lightTexCache.set(key, tex);
  }
  return tex;
}

export type LightSource = {
  x: number;
  y: number;
  radius: number;
  /** 0 = firelight (warm), 1 = cold light (crystals, the mines' lanterns). */
  kind: 0 | 1;
  /** Phase of a flame's flicker; a light without one shines steadily. */
  flicker?: number;
};

export class LightRenderer {
  private lightmap!: RenderTexture;
  readonly overlay: Sprite;
  private ambientGfx!: Graphics;
  private lightContainer!: Container;
  private lightSprites: Sprite[] = [];
  private flickerTime = 0;

  constructor() {
    this.overlay = new Sprite();
    this.overlay.blendMode = 'multiply';
  }

  init(): void {
    this.lightmap = RenderTexture.create({ width: GAME_WIDTH, height: VIEW_HEIGHT });
    this.overlay.texture = this.lightmap;
    this.ambientGfx = new Graphics();
    this.lightContainer = new Container();
    // Pre-warm the common radii (sconces and campfires, wall torches, the heroes' torches) so the first frame doesn't stutter.
    for (const r of [96, 120, 150]) getLightTexture(r, true);
  }

  /** How far a flame's breath has it this frame, from -1 (shrunk, dim) to 1 (swollen, bright); 0 for a steady light. */
  private breath(light: LightSource): number {
    const phase = light.flicker;
    if (phase === undefined) return 0;
    const t = this.flickerTime;
    const sway = Math.sin(t * FLICKER_SLOW + phase) * FLICKER_SWAY;
    const flutter = Math.sin(t * FLICKER_FAST + phase * 2) * FLICKER_FLUTTER;
    const shiver = Math.sin(t * FLICKER_FASTER + phase * 3) * FLICKER_SHIVER;
    return (sway + flutter + shiver) / (FLICKER_SWAY + FLICKER_FLUTTER + FLICKER_SHIVER);
  }

  /** A light's radius this frame: a flame's swells and shrinks with its breath. */
  private flickeredRadius(light: LightSource, breath: number): number {
    if (breath === 0) return light.radius;
    const share = (FLICKER_SWAY + FLICKER_FLUTTER + FLICKER_SHIVER) * breath;
    return Math.max(MIN_FLICKER_RADIUS, light.radius * (1 + share));
  }

  /** A light's brightness this frame: a flame dims as it shrinks. */
  private static flickeredAlpha(breath: number): number {
    return 1 - ((1 - breath) / 2) * (1 - FLICKER_DIM);
  }

  /** The pooled additive sprite for the i-th light drawn this frame. */
  private lightSprite(i: number): Sprite {
    let sprite = this.lightSprites[i];
    if (!sprite) {
      sprite = new Sprite();
      sprite.blendMode = 'add';
      this.lightContainer.addChild(sprite);
      this.lightSprites.push(sprite);
    }
    return sprite;
  }

  /** Whether a light at screen position (sx, sy) reaches into the view at all. */
  private static onScreen(sx: number, sy: number, radius: number): boolean {
    return sx >= -radius && sx <= GAME_WIDTH + radius && sy >= -radius && sy <= VIEW_HEIGHT + radius;
  }

  update(app: Application, lights: readonly LightSource[], tick: number): void {
    this.flickerTime = tick * FLICKER_SPEED;

    // Draw solid dark background into lightmap
    this.ambientGfx.clear();
    this.ambientGfx.rect(0, 0, GAME_WIDTH, VIEW_HEIGHT).fill({ color: AMBIENT, alpha: 1 });
    app.renderer.render({ container: this.ambientGfx, target: this.lightmap, clear: true });

    let used = 0;
    for (const light of lights) {
      const sx = light.x - camera.x;
      const sy = light.y - camera.y;
      if (!LightRenderer.onScreen(sx, sy, light.radius)) continue;
      const breath = this.breath(light);
      const reach = this.flickeredRadius(light, breath);
      const sprite = this.lightSprite(used++);
      sprite.texture = getLightTexture(Math.round(light.radius), light.kind === 0);
      sprite.setSize(reach * 2);
      sprite.x = Math.round(sx - reach);
      sprite.y = Math.round(sy - reach);
      sprite.alpha = LightRenderer.flickeredAlpha(breath);
      sprite.visible = true;
    }
    for (let i = used; i < this.lightSprites.length; i++) this.lightSprites[i].visible = false;

    app.renderer.render({ container: this.lightContainer, target: this.lightmap, clear: false });
  }

  destroy(): void {
    this.lightmap?.destroy();
    this.ambientGfx?.destroy();
    this.lightContainer?.destroy({ children: true });
  }
}
