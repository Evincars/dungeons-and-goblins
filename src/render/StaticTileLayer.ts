import { Container, Particle, ParticleContainer, Rectangle } from 'pixi.js';
import type { Texture, TextureSource } from 'pixi.js';

/** Nothing about a terrain tile changes after it is placed, so nothing is re-uploaded to the GPU per frame. */
const STATIC: ConstructorParameters<typeof ParticleContainer>[0] = {
  roundPixels: true,
  dynamicProperties: { position: false, vertex: false, rotation: false, uvs: false, color: false },
};

/**
 * Terrain that never moves, drawn with Pixi v8's ParticleContainer: each tile is a lightweight Particle
 * rather than a full Sprite, and a container's particles reach the GPU as one batch. A ParticleContainer
 * draws from a single texture source, so tiles are grouped per sheet, one container each, stacked in the
 * order the sheets were first used.
 */
export class StaticTileLayer extends Container {
  private readonly bySource = new Map<TextureSource, ParticleContainer>();
  /** Where its tiles lie: a ParticleContainer measures no bounds, and a filter (a wall cleared over someone) needs them. */
  private readonly extent = new Rectangle();
  private empty = true;

  addTile(texture: Texture, x: number, y: number): void {
    this.layerFor(texture).addParticle(new Particle({ texture, x, y }));
    this.grow(x, y, texture.width, texture.height);
  }

  private grow(x: number, y: number, w: number, h: number): void {
    const e = this.extent;
    if (this.empty) {
      e.x = x;
      e.y = y;
      e.width = w;
      e.height = h;
      this.empty = false;
      this.boundsArea = e;
      return;
    }
    const right = Math.max(e.x + e.width, x + w);
    const bottom = Math.max(e.y + e.height, y + h);
    e.x = Math.min(e.x, x);
    e.y = Math.min(e.y, y);
    e.width = right - e.x;
    e.height = bottom - e.y;
  }

  private layerFor(texture: Texture): ParticleContainer {
    let layer = this.bySource.get(texture.source);
    if (!layer) {
      layer = new ParticleContainer({ ...STATIC, texture });
      this.bySource.set(texture.source, layer);
      this.addChild(layer);
    }
    return layer;
  }
}
