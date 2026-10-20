import { world, q } from '../world';

const BLINK_TICKS = 36;
const BLINK_PERIOD = 4;
/** How fast a dropped ephemeral falls to the ground (pixels per tick², roughly). */
const DROP_GRAVITY = 0.07;

export function updateEphemerals(): void {
  for (const entity of q.ephemerals) {
    if (entity.removed) continue;
    const e = entity.ephemeral;
    e.age++;
    entity.yOffset = Math.max(0, e.drop - e.age * e.age * DROP_GRAVITY);
    const left = e.life - e.age;
    if (entity.sprite) entity.sprite.visible = left > BLINK_TICKS || Math.floor(left / BLINK_PERIOD) % 2 === 0;
    if (e.age >= e.life) world.addComponent(entity, 'removed', true);
  }
}
