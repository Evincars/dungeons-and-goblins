import { world } from '../world';
import { pay } from '../game/Purse';
import { playerUsing } from './TargetSystem';
import { logLine } from './RollLogSystem';
import { sound } from '../audio/SoundPlayer';
import { text } from '../core/texts';

/**
 * Stashes: the barrels, crates, coffins, urns and sacks on the floor can be opened. A player in reach who presses
 * "use" (E, or a click through the crosshair) searches one: most are empty (said over their head), some hold a few
 * coins, straight into the purse. Each is searched once.
 */

const stashes = world.with('position', 'stash');

export function updateStashes(): void {
  for (const stash of stashes) {
    if (stash.removed) continue;
    const finder = playerUsing(stash.position.x, stash.position.y);
    if (!finder) continue;
    sound.playSound('search', stash.position.x, stash.position.y);
    if (stash.stash.coins > 0) pay(finder, stash.stash.coins);
    else logLine(finder, text('roll.empty'), 'miss');
    world.addComponent(stash, 'removed', true);
  }
}
