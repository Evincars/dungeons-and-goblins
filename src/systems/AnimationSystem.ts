import { world } from '../world';
import { sheetCols } from '../render/Sheets';
import { setVisualFrame } from '../render/AnimatedVisual';

export function updateAnimation(_dt: number): void {
  for (const entity of world.with('animation', 'sprite')) {
    const anim = entity.animation!;
    const cols = sheetCols(anim.sheet);

    if (entity.playerInput) {
      const walk = entity.walkTime ?? 0;
      anim.frameX = walk === 0 ? 0 : Math.floor(walk / 4) % anim.frameCount;
    } else {
      anim.timer++;
      if (anim.timer >= anim.frameTime) {
        anim.timer = 0;
        anim.frameX++;
        if (anim.frameX >= anim.frameCount) {
          anim.frameX = anim.loop ? 0 : anim.frameCount - 1;
        }
      }
    }

    // Player: 8 direction rows
    let row = entity.facing ?? anim.frameY;
    // Mob sheets: (facing + 1) & 3 same as source
    if (entity.mobType && !entity.playerInput) {
      row = ((entity.facing ?? 2) + 1) & 3;
    }

    setVisualFrame(entity.sprite!, anim.sheet, anim.frameX % cols, row);
  }
}
