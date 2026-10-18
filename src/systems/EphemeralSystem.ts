import { world } from '../world';

const BLINK_TICKS = 36;
const BLINK_PERIOD = 4;

export function updateEphemerals(): void {
  for (const entity of world.with('position', 'ephemeral')) {
    if (entity.removed) continue;
    const e = entity.ephemeral!;
    e.age++;

    entity.yOffset = Math.max(0, e.drop - e.age * e.age * 0.07);

    if (entity.sprite) {
      const left = e.life - e.age;
      entity.sprite.visible = left > BLINK_TICKS || Math.floor(left / BLINK_PERIOD) % 2 === 0;
    }
    if (e.age >= e.life) world.addComponent(entity, 'removed', true);
  }
}
