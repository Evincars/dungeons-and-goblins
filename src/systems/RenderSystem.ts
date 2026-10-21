import { Graphics, Sprite } from 'pixi.js';
import { world, q } from '../world';
import type { Entity } from '../world';
import type { Level } from '../level/Level';
import { TileType, TILE_WIDTH, TILE_HEIGHT } from '../level/TileType';
import { whiteFrame } from '../render/Sheets';
import { FALL_DEPTH } from './HoleSystem';

type Overlay = { color: number; alpha: number };

/** Players blink red on alternate ticks while hurt. */
const PLAYER_HURT: Overlay = { color: 0xff0000, alpha: 0.5 };
/** A freshly hit mob flashes white for its first few hurt ticks. */
const MOB_HIT_FLASH: Overlay = { color: 0xffffff, alpha: 160 / 256 };
const MOB_HIT_FLASH_AFTER = 34;
/** Hurt mobs glow red, deeper the more health they have lost, fading over the last few ticks. */
const MOB_WOUND_MAX = 180;
const MOB_WOUND_FADE_TICKS = 10;
const PLAYER_FLASH: Overlay = { color: 0xffff80, alpha: 0.18 };
const MOB_FLASH: Overlay = { color: 0xffff80, alpha: 0.5 };
/** Varying red overlay, reused every frame. */
const wound: Overlay = { color: 0xff0000, alpha: 0 };

const renderable = q.renderable;

function mobWound(entity: Entity, t: number): Overlay | null {
  if (t > MOB_HIT_FLASH_AFTER && Math.floor(t / 2) % 2 === 0) return MOB_HIT_FLASH;
  const h = entity.health;
  const hp = Math.max(0, h?.current ?? 0);
  let strength = Math.trunc(MOB_WOUND_MAX - (hp * MOB_WOUND_MAX) / (h?.max || 1));
  if (t < MOB_WOUND_FADE_TICKS) strength = Math.trunc((strength * t) / MOB_WOUND_FADE_TICKS);
  if (strength <= 0) return null;
  wound.alpha = strength / 256;
  return wound;
}

function overlayFor(entity: Entity): Overlay | null {
  const t = entity.hurtTime ?? 0;
  if (t > 0 && entity.playerInput) return t % 2 !== 0 ? PLAYER_HURT : null;
  if (t > 0) return mobWound(entity, t);
  if ((entity.flashTime ?? 0) > 0) return entity.playerInput ? PLAYER_FLASH : MOB_FLASH;
  return null;
}

function overlayLayer(entity: Entity, sprite: Sprite): Sprite {
  if (entity.hurtOverlay) return entity.hurtOverlay;
  const layer = new Sprite();
  layer.anchor.set(0.5, 0.5);
  sprite.parent?.addChild(layer);
  world.addComponent(entity, 'hurtOverlay', layer);
  return layer;
}

/** Tints a white silhouette of the sprite over it while the entity is hurt or flashing. */
function syncOverlay(entity: Entity, sprite: Sprite): void {
  const overlay = sprite.visible ? overlayFor(entity) : null;
  const sheet = entity.animation?.sheet ?? entity.visual?.sheet;
  if (!overlay || !sheet) {
    if (entity.hurtOverlay) entity.hurtOverlay.visible = false;
    return;
  }
  const layer = overlayLayer(entity, sprite);
  layer.x = sprite.x;
  layer.y = sprite.y;
  layer.zIndex = sprite.zIndex + 0.01;
  layer.scale.copyFrom(sprite.scale);
  layer.texture = whiteFrame(sheet, sprite.texture);
  layer.tint = overlay.color;
  layer.alpha = overlay.alpha;
  layer.visible = true;
}

function dropFallMask(entity: Entity, sprite: Sprite): void {
  if (!entity.fallMask) return;
  sprite.mask = null;
  if (entity.hurtOverlay) entity.hurtOverlay.mask = null;
  entity.fallMask.destroy();
  world.removeComponent(entity, 'fallMask');
}

/** The top of the first floor row below the pit the entity is falling into: everything below is hidden. */
function pitFloorY(level: Level, x: number, y: number): number {
  const tx = Math.floor(x / TILE_WIDTH);
  let ty = Math.floor(y / TILE_HEIGHT) + 1;
  while (level.getTile(tx, ty)?.type === TileType.Hole) ty++;
  return ty * TILE_HEIGHT;
}

/** The entity whose fall this sprite follows: its own, or that of the player a "!" hangs over. */
function fallOf(entity: Entity): Entity | undefined {
  if (entity.falling) return entity;
  const owner = entity.fx?.orderId !== undefined ? world.entity(entity.fx.orderId) : undefined;
  return owner?.falling && entity.visual?.sheet === 'exclamation_mark' ? owner : undefined;
}

/** A falling entity sinks into its pit; the floor in front of the pit hides what's below it. */
function syncFall(entity: Entity, sprite: Sprite, level: Level): void {
  const faller = fallOf(entity);
  const falling = faller?.falling;
  const pos = faller?.position;
  if (!falling || !pos) {
    dropFallMask(entity, sprite);
    return;
  }
  sprite.y += Math.round(FALL_DEPTH * Math.min(1, falling.age / falling.duration));
  let mask = entity.fallMask;
  if (!mask) {
    mask = new Graphics();
    sprite.parent?.addChild(mask);
    world.addComponent(entity, 'fallMask', mask);
  }
  mask.clear().rect(0, 0, level.width * TILE_WIDTH, pitFloorY(level, pos.x, pos.y)).fill(0xffffff);
  sprite.mask = mask;
  if (entity.hurtOverlay) entity.hurtOverlay.mask = mask;
}

/**
 * Entities overlap back to front by their feet; an effect tied to an entity (dust behind a runner, the "!"
 * over a faller) is drawn just behind or in front of it instead.
 */
function drawOrder(entity: Entity, pos: { x: number; y: number }): number {
  const fx = entity.fx;
  if (fx?.orderId === undefined) return pos.y;
  return (world.entity(fx.orderId)?.position?.y ?? pos.y) + (fx.orderBias ?? 0);
}

export function updateRender(level: Level): void {
  for (const entity of renderable) {
    const pos = entity.position;
    const sprite = entity.sprite;
    sprite.x = Math.round(pos.x);
    sprite.y = Math.round(pos.y - (entity.yOffset ?? 0));
    sprite.zIndex = drawOrder(entity, pos);
    syncFall(entity, sprite, level);
    syncOverlay(entity, sprite);
  }
}
