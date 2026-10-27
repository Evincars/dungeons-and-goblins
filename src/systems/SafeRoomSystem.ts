import { world, q } from '../world';
import type { Level } from '../level/Level';

/**
 * Each tick, which heroes stand in a safe room (the first one, or the exit's): only there may a hero choose the spells
 * on their quick bar (game/PlayerActions.ts `bindSpell`). Kept on the hero, so a co-op guest's screen knows too.
 */
export function updateSafeRooms(level: Level): void {
  for (const player of q.players) {
    const safe = level.isWorldPosSafe(player.position.x, player.position.y);
    if (player.inSafeRoom === undefined) world.addComponent(player, 'inSafeRoom', safe);
    else player.inSafeRoom = safe;
  }
}
