import { Graphics, Sprite } from 'pixi.js';
import { world } from '../world';
import type { Entity } from '../world';
import type { Level } from '../level/Level';
import { TileType, TILE_WIDTH, TILE_HEIGHT } from '../level/TileType';
import { whiteFrame } from '../render/Sheets';
import { FALL_DEPTH } from './HoleSystem';

type Overlay = { color: number; alpha: number };

function overlayFor(entity: Entity): Overlay | null {
  const t = entity.hurtTime ?? 0;
  if (t > 0) {
    if (entity.playerInput) return t % 2 !== 0 ? { color: 0xff0000, alpha: 0.5 } : null;
    if (t > 34 && Math.floor(t / 2) % 2 === 0) return { color: 0xffffff, alpha: 160 / 256 };
    const h = entity.health;
    const hp = Math.max(0, h?.current ?? 0);
    let strength = Math.trunc(180 - (hp * 180) / (h?.max || 1));
    if (t < 10) strength = Math.trunc((strength * t) / 10);
    return strength > 0 ? { color: 0xff0000, alpha: strength / 256 } : null;
  }
  if ((entity.flashTime ?? 0) > 0) return { color: 0xffff80, alpha: entity.playerInput ? 0.18 : 0.5 };
  return null;
}

function syncOverlay(entity: Entity, sprite: Sprite): void {
  const overlay = sprite.visible ? overlayFor(entity) : null;
  if (!overlay) {
    if (entity.hurtOverlay) entity.hurtOverlay.visible = false;
    return;
  }

  const sheet = entity.animation?.sheet ?? entity.visual?.sheet;
  if (!sheet) return;

  let layer = entity.hurtOverlay;
  if (!layer) {
    layer = new Sprite();
    layer.anchor.set(0.5, 0.5);
    sprite.parent?.addChild(layer);
    world.addComponent(entity, 'hurtOverlay', layer);
  }

  layer.x = sprite.x;
  layer.y = sprite.y;
  layer.zIndex = sprite.zIndex + 0.01;
  layer.scale.copyFrom(sprite.scale);
  layer.texture = whiteFrame(sheet, sprite.texture.frame);
  layer.tint = overlay.color;
  layer.alpha = overlay.alpha;
  layer.visible = true;
}

/** A falling entity sinks into its pit; the floor in front of the pit hides what's below it. */
function syncFall(entity: Entity, sprite: Sprite, level: Level): void {
  if (!entity.falling) {
    if (entity.fallMask) {
      sprite.mask = null;
      if (entity.hurtOverlay) entity.hurtOverlay.mask = null;
      entity.fallMask.destroy();
      world.removeComponent(entity, 'fallMask');
    }
    return;
  }
  const t = Math.min(1, entity.falling.age / entity.falling.duration);
  sprite.y += Math.round(FALL_DEPTH * t);

  const pos = entity.position!;
  const tx = Math.floor(pos.x / TILE_WIDTH);
  let ty = Math.floor(pos.y / TILE_HEIGHT) + 1;
  while (level.getTile(tx, ty)?.type === TileType.Hole) ty++;
  const clipBottom = ty * TILE_HEIGHT;

  let mask = entity.fallMask;
  if (!mask) {
    mask = new Graphics();
    sprite.parent?.addChild(mask);
    world.addComponent(entity, 'fallMask', mask);
  }
  mask.clear().rect(0, 0, level.width * TILE_WIDTH, clipBottom).fill(0xffffff);
  sprite.mask = mask;
  if (entity.hurtOverlay) entity.hurtOverlay.mask = mask;
}

export function updateRender(level: Level): void {
  for (const entity of world.with('position', 'sprite')) {
    const pos = entity.position!;
    const sprite = entity.sprite!;

    const yOff = entity.yOffset ?? 0;
    sprite.x = Math.round(pos.x);
    sprite.y = Math.round(pos.y - yOff);
    sprite.zIndex = pos.y;
    syncFall(entity, sprite, level);

    syncOverlay(entity, sprite);
  }
}
