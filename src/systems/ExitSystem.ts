import { world } from '../world';
import { setVisualFrame } from '../render/AnimatedVisual';
import { sound } from '../audio/SoundPlayer';
import { REACH } from './TargetSystem';

let levelComplete = false;

export function isLevelComplete(): boolean { return levelComplete; }
export function resetLevelComplete(): void { levelComplete = false; }

/** A living player standing on the exit button and pressing "use" ends the level. */
export function updateExit(): void {
  for (const button of world.with('position', 'exitButton')) {
    const bpos = button.position!;
    const eb = button.exitButton!;

    for (const player of world.with('position', 'playerInput', 'health')) {
      if (player.health!.current <= 0) continue;
      const pp = player.position!;
      if (Math.hypot(pp.x - bpos.x, pp.y - bpos.y) > REACH) continue;
      if (!player.playerInput!.intents.use) continue;

      if (!eb.activated) {
        eb.activated = true;
        if (button.visual && button.sprite) setVisualFrame(button.sprite, button.visual.sheet, 1, 0);
        sound.playSound('level_up', bpos.x, bpos.y);
        levelComplete = true;
      }
    }
  }
}
