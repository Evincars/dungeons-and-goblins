import { Container, Graphics, RenderTexture, Sprite, Texture } from 'pixi.js';
import type { Application } from 'pixi.js';
import { GAME_WIDTH, VIEW_HEIGHT, camera } from '../render/Camera';
import { context2d, createCanvas } from '../render/canvas';

const FLICKER_SPEED = 0.05;
const FLICKER_AMOUNT = 5;
/** Frequencies of the two waves a torch flickers with, and the smallest a flickering light gets. */
const FLICKER_FAST = 3.7;
const FLICKER_FASTER = 7.1;
const MIN_FLICKER_RADIUS = 20;
/** Light level everywhere before torches/lantern add to it (multiplied over the scene). */
const AMBIENT = 0x9a94a2;

/** Cached Pixi Textures keyed by radius (positive = torch, negative = player). */
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
  /** 0 = torch (warm), 1 = player lantern */
  kind: 0 | 1;
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
    // Pre-warm common radii so there's no stutter on first torch render
    for (const r of [110, 115, 120, 125]) {
      getLightTexture(r, true);
      getLightTexture(r, false);
    }
  }

  /** A torch's radius this frame: two out-of-step sine waves make the flame breathe. */
  private flickeredRadius(light: LightSource): number {
    if (light.kind !== 0 || light.flicker === undefined) return light.radius;
    const flick = Math.sin(this.flickerTime * FLICKER_FAST + light.flicker) * FLICKER_AMOUNT
      + Math.sin(this.flickerTime * FLICKER_FASTER + light.flicker * 2) * (FLICKER_AMOUNT / 2);
    return Math.max(MIN_FLICKER_RADIUS, light.radius + flick);
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
      const rounded = Math.round(this.flickeredRadius(light));
      const sprite = this.lightSprite(used++);
      sprite.texture = getLightTexture(rounded, light.kind === 0);
      sprite.x = Math.round(sx - rounded);
      sprite.y = Math.round(sy - rounded);
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
