import { q, isPlayer } from '../world';
import type { Entity } from '../world';
import { spawnDrops } from '../entities/Drops';
import { sound } from '../audio/SoundPlayer';
import { REACH } from './TargetSystem';
import { nearby, Sense } from '../ai/perception/spatial';

type Chest = (typeof q.chests)['entities'][number];
const openers: Entity[] = [];

/** Whether a living player within reach pressed "use" (E): chests open on purpose, never by walking into them. */
function opened(chest: Chest): boolean {
  const cp = chest.position;
  for (const e of nearby(cp.x, cp.y, REACH, Sense.player, openers)) {
    if (!isPlayer(e) || e.health.current <= 0 || !e.playerInput.intents.use) continue;
    if (Math.hypot(e.position.x - cp.x, e.position.y - cp.y) <= REACH) return true;
  }
  return false;
}

/** The lid flies open and the chest throws out what its drop table gives (coins, for now). */
function spill(chest: Chest): void {
  const cp = chest.position;
  chest.chest.opened = true;
  sound.playSound('chest_open', cp.x, cp.y);
  spawnDrops(cp.x, cp.y, chest.chest.drops);
}

export function updateChests(): void {
  for (const chest of q.chests) {
    if (chest.removed || chest.chest.opened) continue;
    if (opened(chest)) spill(chest);
  }
}
