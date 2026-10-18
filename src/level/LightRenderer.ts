/**
 * Point-light renderer for dungeon torches and the player's lantern.
 *
 * Creates a dark overlay with warm radial-gradient "holes" cut at each light
 * source position, giving the look of torches illuminating stone corridors.
 * Uses a pre-generated radial gradient texture and additive blending.
 */
import { Container, Graphics, RenderTexture, Sprite, Application } from 'pixi.js';
import { GAME_WIDTH, VIEW_HEIGHT, camera } from '../render/Camera';

const FLICKER_SPEED = 0.05;
const FLICKER_AMOUNT = 5;

/** A cached light-spot texture at a given pixel radius. */
const lightTexCache = new Map<number, HTMLCanvasElement>();

function getLightCanvas(radius: number): HTMLCanvasElement {
  const hit = lightTexCache.get(radius);
  if (hit) return hit;
  const size = radius * 2;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
  grad.addColorStop(0,   'rgba(255, 220, 160, 1.0)');
  grad.addColorStop(0.3, 'rgba(255, 180, 80,  0.7)');
  grad.addColorStop(0.7, 'rgba(200, 100, 20,  0.2)');
  grad.addColorStop(1.0, 'rgba(0,   0,   0,   0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  lightTexCache.set(radius, c);
  return c;
}

/** Player carries a dimmer, cooler lantern light. */
function getPlayerLightCanvas(radius: number): HTMLCanvasElement {
  const key = -radius;
  const hit = lightTexCache.get(key);
  if (hit) return hit;
  const size = radius * 2;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
  grad.addColorStop(0,   'rgba(220, 230, 255, 0.9)');
  grad.addColorStop(0.4, 'rgba(160, 180, 255, 0.5)');
  grad.addColorStop(0.8, 'rgba(80,  80,  160, 0.1)');
  grad.addColorStop(1.0, 'rgba(0,   0,   0,   0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  lightTexCache.set(key, c);
  return c;
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
  private flickerTime = 0;

  constructor() {
    this.overlay = new Sprite();
    this.overlay.blendMode = 'multiply';
  }

  init(app: Application): void {
    this.lightmap = RenderTexture.create({ width: GAME_WIDTH, height: VIEW_HEIGHT });
    this.overlay.texture = this.lightmap;
    this.ambientGfx = new Graphics();
  }

  update(app: Application, lights: LightSource[], tick: number): void {
    this.flickerTime = tick * FLICKER_SPEED;

    // 1. Draw base darkness into an off-screen canvas
    const w = GAME_WIDTH;
    const h = VIEW_HEIGHT;
    const offscreen = document.createElement('canvas');
    offscreen.width = w; offscreen.height = h;
    const ctx = offscreen.getContext('2d')!;

    // Ambient dungeon darkness — very dark, slightly warm
    ctx.fillStyle = 'rgb(8, 5, 3)';
    ctx.fillRect(0, 0, w, h);

    // 2. Stamp each light source (additive blending)
    ctx.globalCompositeOperation = 'screen';

    for (const light of lights) {
      const sx = light.x - camera.x;
      const sy = light.y - camera.y;

      // Skip off-screen lights (with margin)
      if (sx < -light.radius || sx > w + light.radius || sy < -light.radius || sy > h + light.radius) continue;

      // Torch flicker
      let r = light.radius;
      if (light.kind === 0 && light.flicker !== undefined) {
        const flick = Math.sin(this.flickerTime * 3.7 + light.flicker) * FLICKER_AMOUNT
          + Math.sin(this.flickerTime * 7.1 + light.flicker * 2) * (FLICKER_AMOUNT / 2);
        r = light.radius + flick;
      }

      const canvas = light.kind === 0 ? getLightCanvas(Math.round(r)) : getPlayerLightCanvas(Math.round(r));
      ctx.drawImage(canvas, Math.round(sx - r), Math.round(sy - r));
    }

    ctx.globalCompositeOperation = 'source-over';

    // 3. Upload the result to the RenderTexture
    // Pixi 8: use renderer.texture.update or recreate from canvas
    const img = new Image();
    img.src = offscreen.toDataURL();
    // Use Sprite with canvas texture — update each frame
    const tex = this.lightmap;
    app.renderer.render({
      container: (() => {
        const s = new Sprite();
        s.texture = tex;
        return s;
      })(),
      target: tex,
      clear: false,
    });

    // Instead: draw directly using Graphics on a temp container
    const gfx = this.ambientGfx;
    gfx.clear();
    gfx.rect(0, 0, w, h).fill({ color: 0x080503, alpha: 1 });

    // Render darkness base
    app.renderer.render({ container: gfx, target: this.lightmap, clear: true });

    // Render each light as additive sprite
    const lightContainer = new Container();
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

      const lc = light.kind === 0 ? getLightCanvas(Math.round(r)) : getPlayerLightCanvas(Math.round(r));
      const sprite = Sprite.from(lc);
      sprite.blendMode = 'add';
      sprite.x = Math.round(sx - r);
      sprite.y = Math.round(sy - r);
      lightContainer.addChild(sprite);
    }
    app.renderer.render({ container: lightContainer, target: this.lightmap, clear: false });
    lightContainer.destroy({ children: true });
  }

  destroy(): void {
    this.lightmap?.destroy();
    this.ambientGfx?.destroy();
  }
}
