import { world, isPlayer } from '../world';
import type { Entity } from '../world';
import { setVisualFrame } from '../render/AnimatedVisual';
import { sound } from '../audio/SoundPlayer';
import { REACH } from './TargetSystem';
import { nearby, Sense } from '../ai/perception/spatial';

let levelComplete = false;
/** Frame of the exit lever once pulled. */
const PULLED_FRAME = 1;

export function isLevelComplete(): boolean { return levelComplete; }
export function resetLevelComplete(): void { levelComplete = false; }

const buttons = world.with('position', 'exitButton');
const pressers: Entity[] = [];

/** Whether a living player within reach of the point pressed "use" this tick. */
function usedNear(x: number, y: number): boolean {
  for (const e of nearby(x, y, REACH, Sense.player, pressers)) {
    if (isPlayer(e) && e.health.current > 0 && e.playerInput.intents.use) return true;
  }
  return false;
}

/** A living player standing at the exit button and pressing "use" ends the level. */
export function updateExit(): void {
  for (const button of buttons) {
    const { x, y } = button.position;
    if (button.exitButton.activated || !usedNear(x, y)) continue;
    button.exitButton.activated = true;
    // Kept in the visual too, so co-op guests (who mirror components) see the lever pulled.
    if (button.visual) button.visual.col = PULLED_FRAME;
    if (button.visual && button.sprite) setVisualFrame(button.sprite, button.visual.sheet, PULLED_FRAME, 0);
    sound.playSound('level_up', x, y);
    levelComplete = true;
  }
}
