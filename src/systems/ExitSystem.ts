import { world } from '../world';
import { setVisualFrame } from '../render/AnimatedVisual';
import { sound } from '../audio/SoundPlayer';
import { playerUsing } from './TargetSystem';

let levelComplete = false;
/** Frame of the exit lever once pulled. */
const PULLED_FRAME = 1;

export function isLevelComplete(): boolean { return levelComplete; }
export function resetLevelComplete(): void { levelComplete = false; }

const buttons = world.with('position', 'exitButton');
/** A living player standing at the exit button and pressing "use" ends the level. */
export function updateExit(): void {
  for (const button of buttons) {
    const { x, y } = button.position;
    if (button.exitButton.activated || !playerUsing(button)) continue;
    button.exitButton.activated = true;
    // Kept in the visual too, so co-op guests (who mirror components) see the lever pulled.
    if (button.visual) button.visual.col = PULLED_FRAME;
    if (button.visual && button.sprite) setVisualFrame(button.sprite, button.visual.sheet, PULLED_FRAME, 0);
    sound.playSound('level_exit', x, y);
    levelComplete = true;
  }
}
