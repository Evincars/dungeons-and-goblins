import { world } from '../world';
import { sound } from '../audio/SoundPlayer';

const WALK_STEP_TICKS = 15;
const SPRINT_FACTOR = 0.6;

const steppers = world.with('position', 'playerInput');

export function updateFootsteps(): void {
  for (const player of steppers) {
    const moving = (player.walkTime ?? 0) > 0 && !player.falling;
    if (!moving) {
      player.stepTimer = 0;
      continue;
    }
    if ((player.stepTimer ?? 0) > 0) {
      player.stepTimer = (player.stepTimer ?? 0) - 1;
      continue;
    }
    const every = player.playerStats?.sprinting ? Math.trunc(WALK_STEP_TICKS * SPRINT_FACTOR) : WALK_STEP_TICKS;
    player.stepTimer = every - 1;
    sound.playSound(Math.random() < 0.5 ? 'step' : 'step2', player.position.x, player.position.y);
  }
}
