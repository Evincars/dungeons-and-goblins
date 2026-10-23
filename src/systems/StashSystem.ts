import { world } from '../world';
import { pay } from '../game/Purse';
import { playerUsing } from './TargetSystem';

/**
 * Stashes: some of the urns, coffins, bowls and sacks on the floor hide a few coins. A player in reach who
 * presses "use" (E, or a click through the crosshair) finds them, straight into the purse; each is found once.
 */

const stashes = world.with('position', 'stash');

export function updateStashes(): void {
  for (const stash of stashes) {
    if (stash.removed) continue;
    const finder = playerUsing(stash.position.x, stash.position.y);
    if (!finder) continue;
    pay(finder, stash.stash.coins);
    world.addComponent(stash, 'removed', true);
  }
}
