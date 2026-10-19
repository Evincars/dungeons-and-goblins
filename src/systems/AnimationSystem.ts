import { world } from '../world';
import { sheetCols } from '../render/Sheets';
import { setVisualFrame } from '../render/AnimatedVisual';

export function updateAnimation(_dt: number): void {
  for (const entity of world.with('animation', 'sprite')) {
    const anim = entity.animation!;
    const cols = sheetCols(anim.sheet);

    // Player walk/idle follows the step cadence; everything else (and player attacks) is timer-driven.
    const walkCycle = entity.playerInput && entity.animState !== 'attack';
    if (walkCycle) {
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

    // Side-view sprites (soldier/orc 100×100) live in a single row
    const sideView = entity.visual?.flipX !== undefined;
    let row = sideView ? 0 : (entity.facing ?? anim.frameY);
    if (!sideView && entity.mobType && !entity.playerInput) {
      // Legacy 4-direction mob sheets: row by facing
      row = ((entity.facing ?? 2) + 1) & 3;
    }

    setVisualFrame(entity.sprite!, anim.sheet, anim.frameX % cols, row);
  }
}
