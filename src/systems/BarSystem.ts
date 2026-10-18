import { Container, Sprite } from 'pixi.js';
import { world } from '../world';
import type { Entity } from '../world';
import { frameTexture, whiteFrameTexture } from '../render/Sheets';

const BAR_STEPS = 20;
const BAR_HALF_WIDTH = 16;

function fillColor(value: number, max: number): number {
  const tenth = max / 10;
  if (value < tenth * 3) return 0xf62800;
  if (value < tenth * 6) return 0xfe7700;
  if (value < tenth * 8) return 0xfef115;
  return 0x8af116;
}

function createHealthBar(gameLayer: Container): { container: Container; fill: Sprite } {
  const container = new Container();
  const fill = new Sprite();
  container.addChild(
    new Sprite(frameTexture('bar_green_underlay', 0, 0)),
    fill,
    new Sprite(frameTexture('bar_outline', 0, 0)),
  );
  gameLayer.addChild(container);
  return { container, fill };
}

export function updateBars(gameLayer: Container): void {
  for (const entity of world.with('position', 'health', 'healthBarOffset')) {
    const { current, max } = entity.health!;
    const maxValue = Math.trunc(max);
    const visible = !entity.removed && entity.respawnTicks === undefined && current < max && maxValue > 0;

    let bar = entity.healthBar;
    if (!visible) {
      if (bar) bar.container.visible = false;
      continue;
    }
    if (!bar) {
      bar = createHealthBar(gameLayer);
      world.addComponent(entity, 'healthBar', bar);
    }

    const pos = entity.position!;
    const value = Math.max(0, Math.trunc(current));
    bar.fill.texture = whiteFrameTexture('bar_green', Math.trunc((value * BAR_STEPS) / maxValue), 0);
    bar.fill.tint = fillColor(value, maxValue);
    bar.container.x = Math.round(pos.x) - BAR_HALF_WIDTH;
    bar.container.y = Math.round(pos.y) + entity.healthBarOffset!;
    bar.container.zIndex = pos.y + 0.5;
    bar.container.visible = true;
  }
}

export function destroyAttachments(entity: Entity): void {
  entity.healthBar?.container.destroy({ children: true });
  entity.hurtOverlay?.destroy();
  entity.fallMask?.destroy();
  entity.priceLabel?.destroy();
}
