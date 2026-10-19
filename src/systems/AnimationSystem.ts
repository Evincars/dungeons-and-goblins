import { world } from '../world';
import { sheetCols } from '../render/Sheets';
import { setVisualFrame } from '../render/AnimatedVisual';

// Directional sheets hold rows S, SE, E, N. Facing (0=S, then clockwise through
// W to N and E: 1=SW 2=W 3=NW 4=N 5=NE 6=E 7=SE) maps to a row; west-facing
// directions are mirrored east-facing ones, and up-diagonals use the back view.
const DIR_ROW = [0, 1, 2, 3, 3, 3, 2, 1];
const DIR_FLIP = [false, true, true, true, false, false, false, false];

export function updateAnimation(_dt: number): void {
  for (const entity of world.with('animation', 'sprite')) {
    const anim = entity.animation!;
    const cols = sheetCols(anim.sheet);

    // Player walking follows the step cadence; everything else is timer-driven.
    const walkCycle = entity.playerInput && entity.animState === 'walk';
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

    if (entity.visual?.directional) {
      const facing = (entity.facing ?? 0) & 7;
      const sprite = entity.sprite!;
      entity.visual.flipX = DIR_FLIP[facing];
      sprite.scale.x = (DIR_FLIP[facing] ? -1 : 1) * Math.abs(sprite.scale.x);
      setVisualFrame(sprite, anim.sheet, anim.frameX % cols, DIR_ROW[facing]);
      continue;
    }

    // Side-view sprites (orc 100×100) live in a single row
    const sideView = entity.visual?.flipX !== undefined;
    let row = sideView ? 0 : (entity.facing ?? anim.frameY);
    if (!sideView && entity.mobType && !entity.playerInput) {
      // Legacy 4-direction mob sheets: row by facing
      row = ((entity.facing ?? 2) + 1) & 3;
    }

    setVisualFrame(entity.sprite!, anim.sheet, anim.frameX % cols, row);
  }
}
