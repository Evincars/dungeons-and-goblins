import { world, isPlayer } from '../world';
import type { Entity } from '../world';
import type { Level } from '../level/Level';
import { text } from '../core/texts';
import { setVisualFrame } from '../render/AnimatedVisual';
import { sound } from '../audio/SoundPlayer';
import { coop } from '../network/CoopSession';
import { nearby, Sense } from '../ai/perception/spatial';
import { REACH } from './TargetSystem';
import { unlockDoors } from './DoorSystem';
import { logLine } from './RollLogSystem';

/** The lever's frame once pulled down. */
const PULLED_FRAME = 1;

const levers = world.with('position', 'lever');
const pullers: Entity[] = [];

/** Whether a living player within reach of the point pressed "use" this tick. */
function usedNear(x: number, y: number): boolean {
  for (const e of nearby(x, y, REACH, Sense.player, pullers)) {
    if (isPlayer(e) && e.health.current > 0 && e.playerInput.intents.use) return true;
  }
  return false;
}

/**
 * The safe room starts closed: a player pulling the lever by its door (E) raises the portcullis and opens
 * the way into the dungeon. In co-op the host holds it until every guest has the level loaded and stands
 * in the safe room, and says how many it is waiting for.
 */
export function updateLevers(level: Level): void {
  for (const lever of levers) {
    const { x, y } = lever.position;
    if (lever.lever.pulled || !usedNear(x, y)) continue;
    const waiting = coop.role === 'host' ? coop.guestsStillLoading() : 0;
    if (waiting > 0) {
      logLine(lever, text('lever.waiting', { count: waiting }), 'miss');
      sound.playSound('fail', x, y);
      continue;
    }
    lever.lever.pulled = true;
    // Kept in the visual too, so co-op guests (who mirror components) see the lever pulled.
    if (lever.visual) lever.visual.col = PULLED_FRAME;
    if (lever.visual && lever.sprite) setVisualFrame(lever.sprite, lever.visual.sheet, PULLED_FRAME, 0);
    unlockDoors(level);
  }
}
