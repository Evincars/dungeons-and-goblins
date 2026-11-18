import { world } from '../world';
import { pay } from '../game/Purse';
import { playerUsing } from './TargetSystem';
import { logLine } from './RollLogSystem';
import { sound } from '../audio/SoundPlayer';
import { text } from '../core/texts';
import { spawnDrops } from '../entities/Drops';

/**
 * Stashes: the barrels, crates, coffins, urns and sacks on the floor can be opened. A player in reach who presses
 * "use" (E, or a click through the crosshair) searches one: most are empty (said over their head), some hold a few
 * coins, straight into the purse; a tomb now and then a piece of gear too. Each is searched once.
 */

const stashes = world.with('position', 'stash');

export function updateStashes(): void {
  for (const stash of stashes) {
    if (stash.removed) continue;
    const finder = playerUsing(stash);
    if (!finder) continue;
    sound.playSound('search', stash.position.x, stash.position.y);
    const { coins, gear } = stash.stash;
    if (coins > 0) pay(finder, coins);
    if (gear) spawnDrops(stash.position.x, stash.position.y, 'tomb', finder);
    if (coins <= 0 && !gear) logLine(finder, text('roll.empty'), 'miss');
    world.addComponent(stash, 'removed', true);
  }
}
