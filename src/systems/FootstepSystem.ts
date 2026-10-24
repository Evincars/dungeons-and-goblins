import { world } from '../world';
import { sound } from '../audio/SoundPlayer';
import { MOB_CRIES } from '../audio/SoundBank';

const WALK_STEP_TICKS = 15;
const SPRINT_FACTOR = 0.6;

/** A heavy enemy's tread falls this often (ticks) while it walks. */
const HEAVY_STEP_TICKS = 28;

const steppers = world.with('position', 'playerInput');
const enemies = world.with('position', 'mobType');

/** The biggest enemies (those with a step among their cries) are heard walking. */
function tread(mob: (typeof enemies)['entities'][number]): void {
  const step = MOB_CRIES[mob.mobType].step;
  const walked = mob.walkTime ?? 0;
  if (step && walked > 0 && walked % HEAVY_STEP_TICKS === 0) sound.playSound(step, mob.position.x, mob.position.y);
}

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
    sound.playSound('step', player.position.x, player.position.y);
  }
  for (const mob of enemies) tread(mob);
}
