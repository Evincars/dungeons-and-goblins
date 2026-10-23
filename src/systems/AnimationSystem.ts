import { q } from '../world';
import { sheetCols } from '../render/Sheets';
import { setVisualFrame } from '../render/AnimatedVisual';

type Animation = (typeof q.animated)['entities'][number]['animation'];

/** Moves a strip on by one tick: the next frame when its time is up, looping or holding at the end. */
function advance(anim: Animation): void {
  if (++anim.timer < anim.frameTime) return;
  anim.timer = 0;
  anim.frameX++;
  if (anim.frameX >= anim.frameCount) anim.frameX = anim.loop ? 0 : anim.frameCount - 1;
}

/** Timer-driven strips (effects, pickups, torches); characters use CharacterAnimationSystem. */
export function updateAnimation(): void {
  for (const entity of q.animated) {
    const anim = entity.animation;
    advance(anim);
    setVisualFrame(entity.sprite, anim.sheet, ((anim.firstFrame ?? 0) + anim.frameX) % sheetCols(anim.sheet), anim.frameY);
  }
}
