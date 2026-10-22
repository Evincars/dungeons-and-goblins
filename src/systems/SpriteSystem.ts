import { Sprite } from 'pixi.js';
import type { Container } from 'pixi.js';
import { q, world } from '../world';
import { frameTexture } from '../render/Sheets';
import { createAnimatedVisual, setVisualFrame } from '../render/AnimatedVisual';
import { anchorX, characterDef } from '../characters/Characters';

/** Nests crack through this many frames as they lose health. */
const NEST_CRACK_FRAMES = 3;

const nests = world.with('spawner', 'visual', 'sprite', 'health');
const chestSprites = world.with('chest', 'visual', 'sprite');

function createSprites(gameLayer: Container): void {
  for (const entity of q.needsSprite) {
    const v = entity.visual;
    const sprite = entity.animation
      ? createAnimatedVisual(v.sheet, v.col ?? 0, v.row ?? 0)
      : new Sprite(frameTexture(v.sheet, v.col ?? 0, v.row ?? 0));
    sprite.anchor.set(entity.character ? anchorX(characterDef(entity.character.def)) : 0.5, 0.5);
    if (v.scale) sprite.scale.set(v.scale);
    if (v.rotation) sprite.rotation = v.rotation;
    gameLayer.addChild(sprite);
    world.addComponent(entity, 'sprite', sprite);
  }
}

function crackNests(): void {
  for (const nest of nests) {
    const { current, max } = nest.health;
    const col = Math.min(NEST_CRACK_FRAMES, Math.max(0, Math.trunc(NEST_CRACK_FRAMES - (NEST_CRACK_FRAMES * current) / max)));
    if (nest.visual.col === col) continue;
    nest.visual.col = col;
    nest.sprite.texture = frameTexture(nest.visual.sheet, col, nest.visual.row ?? 0);
  }
}

/** Chests switch frame when opened. */
function showOpenedChests(): void {
  for (const chest of chestSprites) {
    const col = chest.chest.opened ? 1 : 0;
    if (chest.visual.col === col) continue;
    chest.visual.col = col;
    setVisualFrame(chest.sprite, chest.visual.sheet, col, chest.visual.row ?? 0);
  }
}

export function updateSprites(gameLayer: Container): void {
  createSprites(gameLayer);
  crackNests();
  showOpenedChests();
}
