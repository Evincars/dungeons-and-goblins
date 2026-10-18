import { Sprite } from 'pixi.js';
import { world } from '../world';
import type { Entity } from '../world';
import { whiteFrame } from '../render/Sheets';

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
  layer.texture = whiteFrame(sheet, sprite.texture.frame);
  layer.tint = overlay.color;
  layer.alpha = overlay.alpha;
  layer.visible = true;
}

export function updateRender(_dt: number): void {
  for (const entity of world.with('position', 'sprite')) {
    const pos = entity.position!;
    const sprite = entity.sprite!;

    if (entity.playerInput) {
      sprite.visible = entity.respawnTicks === undefined;
    }

    const yOff = entity.yOffset ?? 0;
    sprite.x = Math.round(pos.x);
    sprite.y = Math.round(pos.y - yOff);
    sprite.zIndex = pos.y;

    syncOverlay(entity, sprite);
  }
}
