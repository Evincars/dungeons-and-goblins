import { Container, Particle, ParticleContainer } from 'pixi.js';
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

  addTile(texture: Texture, x: number, y: number): Particle {
    const particle = new Particle({ texture, x, y });
    this.layerFor(texture).addParticle(particle);
    return particle;
  }

  /** Uploads its tiles afresh after one of them was changed (a wall turned see-through: render/SeeThrough.ts). */
  refresh(): void {
    for (const layer of this.bySource.values()) layer.update();
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
