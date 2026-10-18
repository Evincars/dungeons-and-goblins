import { world } from '../world';
import { createDustFx } from '../entities/FxFactory';

const WALK_INTERVAL = 8;
const SPRINT_INTERVAL = 4;
const TRAIL = 7;
const SCATTER = 4;

function nextInterval(sprinting: boolean): number {
  const base = sprinting ? SPRINT_INTERVAL : WALK_INTERVAL;
  return Math.max(2, base + Math.floor(Math.random() * 5) - 2);
}

export function updateDust(): void {
  for (const player of world.with('position', 'velocity', 'playerStats')) {
    const moving = (player.walkTime ?? 0) > 0;
    if (!moving) { player.dustTimer = 0; continue; }

    const timer = (player.dustTimer ?? 0) - 1;
    if (timer > 0) { player.dustTimer = timer; continue; }
    player.dustTimer = nextInterval(player.playerStats!.sprinting);

    const v = player.velocity!;
    const len = Math.hypot(v.x, v.y);
    if (len < 0.01) continue;

    const dirX = v.x / len;
    const dirY = v.y / len;
    const along = TRAIL + (Math.random() * 2 - 1) * SCATTER;
    const across = (Math.random() * 2 - 1) * SCATTER;
    const pos = player.position!;
    createDustFx(pos.x - dirX * along - dirY * across, pos.y - dirY * along + dirX * across + 2);
  }
}
