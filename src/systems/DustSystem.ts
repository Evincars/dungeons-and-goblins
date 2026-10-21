import { world } from '../world';
import { spawnDust } from '../entities/FxFactory';

const WALK_INTERVAL = 8;
const SPRINT_INTERVAL = 4;
/** Puff intervals vary by up to this many ticks either way, and never drop below the minimum. */
const INTERVAL_JITTER = 2;
const MIN_INTERVAL = 2;
const TRAIL = 7;
const SCATTER = 4;
/** Puffs rise from just below the feet. */
const FOOT_DROP = 2;
const STILL = 0.01;

const runners = world.with('position', 'velocity', 'playerStats');

function nextInterval(sprinting: boolean): number {
  const base = sprinting ? SPRINT_INTERVAL : WALK_INTERVAL;
  return Math.max(MIN_INTERVAL, base + Math.floor(Math.random() * (INTERVAL_JITTER * 2 + 1)) - INTERVAL_JITTER);
}

export function updateDust(): void {
  for (const player of runners) {
    if ((player.walkTime ?? 0) <= 0) {
      player.dustTimer = 0;
      continue;
    }
    const timer = (player.dustTimer ?? 0) - 1;
    if (timer > 0) {
      player.dustTimer = timer;
      continue;
    }
    player.dustTimer = nextInterval(player.playerStats.sprinting);

    const v = player.velocity;
    const len = Math.hypot(v.x, v.y);
    if (len < STILL) continue;
    const dirX = v.x / len;
    const dirY = v.y / len;
    const along = TRAIL + (Math.random() * 2 - 1) * SCATTER;
    const across = (Math.random() * 2 - 1) * SCATTER;
    const pos = player.position;
    spawnDust(player, pos.x - dirX * along - dirY * across, pos.y - dirY * along + dirX * across + FOOT_DROP);
  }
}
