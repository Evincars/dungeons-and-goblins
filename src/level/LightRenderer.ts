import { Container, Graphics, RenderTexture, Sprite, Texture, Application } from 'pixi.js';
import { GAME_WIDTH, VIEW_HEIGHT, camera } from '../render/Camera';

const FLICKER_SPEED = 0.05;
const FLICKER_AMOUNT = 5;

/** Cached Pixi Textures keyed by radius (positive = torch, negative = player). */
const lightTexCache = new Map<number, Texture>();

function makeLightTexture(radius: number, warm: boolean): Texture {
  const size = radius * 2;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d')!;
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

  init(_app: Application): void {
    this.lightmap = RenderTexture.create({ width: GAME_WIDTH, height: VIEW_HEIGHT });
    this.overlay.texture = this.lightmap;
    this.ambientGfx = new Graphics();
    this.lightContainer = new Container();
    // Pre-warm common radii so there's no stutter on first torch render
    for (const r of [60, 70, 80, 90, 95]) {
      getLightTexture(r, true);
      getLightTexture(r, false);
    }
  }

  update(app: Application, lights: LightSource[], tick: number): void {
    this.flickerTime = tick * FLICKER_SPEED;
    const w = GAME_WIDTH;
    const h = VIEW_HEIGHT;

    // Draw solid dark background into lightmap
    this.ambientGfx.clear();
    this.ambientGfx.rect(0, 0, w, h).fill({ color: 0x080503, alpha: 1 });
    app.renderer.render({ container: this.ambientGfx, target: this.lightmap, clear: true });

    // Reuse sprite pool for lights
    let spriteIdx = 0;
    for (const light of lights) {
      const sx = light.x - camera.x;
      const sy = light.y - camera.y;
      if (sx < -light.radius || sx > w + light.radius || sy < -light.radius || sy > h + light.radius) continue;

      let r = light.radius;
      if (light.kind === 0 && light.flicker !== undefined) {
        const flick = Math.sin(this.flickerTime * 3.7 + light.flicker) * FLICKER_AMOUNT
          + Math.sin(this.flickerTime * 7.1 + light.flicker * 2) * (FLICKER_AMOUNT / 2);
        r = Math.max(20, light.radius + flick);
      }

      const rounded = Math.round(r);
      const tex = getLightTexture(rounded, light.kind === 0);

      let sprite = this.lightSprites[spriteIdx];
      if (!sprite) {
        sprite = new Sprite();
        sprite.blendMode = 'add';
        this.lightContainer.addChild(sprite);
        this.lightSprites.push(sprite);
      }
      sprite.texture = tex;
      sprite.x = Math.round(sx - rounded);
      sprite.y = Math.round(sy - rounded);
      sprite.visible = true;
      spriteIdx++;
    }
    // Hide unused pool sprites
    for (let i = spriteIdx; i < this.lightSprites.length; i++) {
      this.lightSprites[i].visible = false;
    }

    app.renderer.render({ container: this.lightContainer, target: this.lightmap, clear: false });
  }

  destroy(): void {
    this.lightmap?.destroy();
    this.ambientGfx?.destroy();
    this.lightContainer?.destroy({ children: true });
  }
}
