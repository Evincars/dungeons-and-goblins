import { q } from '../world';
import type { Player } from '../world';
import { spawnDrops } from '../entities/Drops';
import { sound } from '../audio/SoundPlayer';
import { playerUsing } from './TargetSystem';

type Chest = (typeof q.chests)['entities'][number];

/** The lid flies open: its coins go to whoever opened it, its gear onto the floor (or, a rare piece in co-op, to the party's roll). */
function spill(chest: Chest, opener: Player): void {
  const cp = chest.position;
  chest.chest.opened = true;
  sound.playSound('chest_open', cp.x, cp.y);
  spawnDrops(cp.x, cp.y, chest.chest.drops, opener);
}

/** Chests open on purpose — a living player within reach presses "use" (E) — never by walking into them. */
export function updateChests(): void {
  for (const chest of q.chests) {
    if (chest.removed || chest.chest.opened) continue;
    const opener = playerUsing(chest);
    if (opener) spill(chest, opener);
  }
}
