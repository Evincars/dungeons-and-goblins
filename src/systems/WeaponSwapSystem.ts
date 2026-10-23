import { q } from '../world';
import { swapWeapons } from '../game/PlayerActions';
import { sound } from '../audio/SoundPlayer';

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
    sound.playSound(swapWeapons(player) ? 'sword_swing' : 'fail', x, y);
  }
}
