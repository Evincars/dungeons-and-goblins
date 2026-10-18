import { world } from '../world';
import { setVisualFrame } from '../render/AnimatedVisual';

export function updateFx(): void {
  for (const entity of world.with('fx', 'visual')) {
    if (entity.removed) continue;
    const fx = entity.fx!;
    const visual = entity.visual!;
    const frame = fx.cycle
      ? fx.age % fx.frames
      : Math.min(fx.frames - 1, Math.floor((fx.age * fx.frames) / fx.duration));

    if (visual.col !== frame) {
      visual.col = frame;
      if (entity.sprite) setVisualFrame(entity.sprite, visual.sheet, frame);
    }
    if (fx.rise) entity.position!.y -= fx.rise;
    if (++fx.age >= fx.duration) world.addComponent(entity, 'removed', true);
  }
}
