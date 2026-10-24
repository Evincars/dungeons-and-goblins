import { q } from '../world';
import { swapWeapons } from '../game/PlayerActions';
import { sound } from '../audio/SoundPlayer';
import { holdsBow } from './ArrowSystem';

/**
 * Q trades the 1st and 2nd weapon. It runs on whoever owns the world (alone, or the host for every guest's
 * input), and the new loadout reaches guests with the next world update.
 */
export function updateWeaponSwap(): void {
  for (const player of q.players) {
    const intents = player.playerInput.intents;
    if (!intents.swap) continue;
    intents.swap = false;
    if (player.health.current <= 0) continue;
    const { x, y } = player.position;
    if (!swapWeapons(player)) sound.playSound('fail', x, y);
    else sound.playSound(holdsBow(player) ? 'bow_draw' : 'swap', x, y);
  }
}
