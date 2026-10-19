import { Sprite } from 'pixi.js';
import type { Container } from 'pixi.js';
import { q, world } from '../world';
import { frameTexture } from '../render/Sheets';
import { destroyAttachments } from './BarSystem';
import { createAnimatedVisual, setVisualFrame } from '../render/AnimatedVisual';

export function updateSprites(gameLayer: Container): void {
  for (const entity of q.needsSprite) {
    const v = entity.visual!;
    const animated = !!(entity.animation);
    const sprite = animated
      ? createAnimatedVisual(v.sheet, v.col ?? 0, v.row ?? 0)
      : new Sprite(frameTexture(v.sheet, v.col ?? 0, v.row ?? 0));
    sprite.anchor.set(0.5, 0.5);
    if (v.scale) sprite.scale.set(v.scale);
    gameLayer.addChild(sprite);
    world.addComponent(entity, 'sprite', sprite);
  }

  // Sync flipX for side-view sprites: mirror when moving left. Directional
  // sprites face their aim instead (see AnimationSystem).
  for (const entity of world.with('visual', 'sprite', 'velocity')) {
    const v = entity.visual!;
    if (v.flipX === undefined || v.directional) continue;
    const vx = entity.velocity!.x;
    if (vx < -0.05) v.flipX = true;
    else if (vx > 0.05) v.flipX = false;
    const sprite = entity.sprite!;
    if (v.flipX) {
      sprite.scale.x = -Math.abs(sprite.scale.x);
    } else {
      sprite.scale.x = Math.abs(sprite.scale.x);
    }
  }

  // Nests crack through four frames as they lose health
  for (const nest of world.with('spawner', 'visual', 'sprite', 'health')) {
    const v = nest.visual!;
    const { current, max } = nest.health!;
    const col = Math.min(3, Math.max(0, Math.trunc(3 - (3 * current) / max)));
    if (v.col === col) continue;
    v.col = col;
    nest.sprite!.texture = frameTexture(v.sheet, col, v.row ?? 0);
  }

  // Chests switch frame when opened
  for (const chest of world.with('chest', 'visual', 'sprite')) {
    const v = chest.visual!;
    const col = chest.chest!.opened ? 1 : 0;
    if (v.col !== col) {
      v.col = col;
      setVisualFrame(chest.sprite!, v.sheet, col, v.row ?? 0);
    }
  }
}

export function clearSprites(): void {
  for (const entity of world.with('sprite')) {
    destroyAttachments(entity);
    entity.sprite!.destroy({ children: true });
    world.removeComponent(entity, 'sprite');
  }
}
