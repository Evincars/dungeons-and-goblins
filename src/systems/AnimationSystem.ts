import { world } from '../world';
import { sheetCols } from '../render/Sheets';
import { setVisualFrame } from '../render/AnimatedVisual';

/** Timer-driven strips (effects, pickups, torches); characters use CharacterAnimationSystem. */
export function updateAnimation(_dt: number): void {
  for (const entity of world.with('animation', 'sprite')) {
    const anim = entity.animation!;
    const cols = sheetCols(anim.sheet);

    anim.timer++;
    if (anim.timer >= anim.frameTime) {
      anim.timer = 0;
      anim.frameX++;
      if (anim.frameX >= anim.frameCount) {
        anim.frameX = anim.loop ? 0 : anim.frameCount - 1;
      }
    }

    setVisualFrame(entity.sprite!, anim.sheet, anim.frameX % cols, anim.frameY);
  }
}
