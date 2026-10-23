import { world } from '../world';
import { setVisualFrame } from '../render/AnimatedVisual';

const effects = world.with('fx', 'visual', 'position');
type Effect = (typeof effects)['entities'][number];

/** The frame an effect shows at its age: cycling, or played once across its duration. */
function frameOf(fx: Effect['fx']): number {
  if (fx.cycle) return fx.age % fx.frames;
  return Math.min(fx.frames - 1, Math.floor((fx.age * fx.frames) / fx.duration));
}

function showFrame(entity: Effect, frame: number): void {
  if (entity.visual.col === frame) return;
  entity.visual.col = frame;
  if (entity.sprite) setVisualFrame(entity.sprite, entity.visual.sheet, frame, entity.visual.row ?? 0);
}

export function updateFx(): void {
  for (const entity of effects) {
    if (entity.removed) continue;
    const fx = entity.fx;
    showFrame(entity, (fx.first ?? 0) + frameOf(fx));
    if (fx.rise) entity.position.y -= fx.rise;
    if (++fx.age >= fx.duration) world.addComponent(entity, 'removed', true);
  }
}
