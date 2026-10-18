import { world } from '../world';
import { sound } from '../audio/SoundPlayer';

const WALK_STEP_TICKS = 15;
const SPRINT_FACTOR = 0.6;

export function updateFootsteps(): void {
  for (const player of world.with('position', 'playerInput')) {
    const moving = (player.walkTime ?? 0) > 0 && !player.falling;
    if (!moving) { player.stepTimer = 0; continue; }

    if ((player.stepTimer ?? 0) > 0) { player.stepTimer!--; continue; }
    let every = WALK_STEP_TICKS;
    if (player.playerStats?.sprinting) every = Math.trunc(every * SPRINT_FACTOR);
    player.stepTimer = every - 1;
    const sfx = Math.random() < 0.5 ? 'step' : 'step2';
    sound.playSound(sfx, player.position!.x, player.position!.y);
  }
}
