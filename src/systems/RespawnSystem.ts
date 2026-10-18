import { world } from '../world';
import type { Level } from '../level/Level';
import { respawnPlayer } from './HoleSystem';

export const RESPAWN_TICKS = 180;

export function updateRespawns(level: Level, dt: number): void {
  for (const player of world.with('playerInput', 'respawnTicks')) {
    player.respawnTicks = Math.max(0, player.respawnTicks! - dt);
    if (player.respawnTicks === 0) {
      world.removeComponent(player, 'respawnTicks');
      respawnPlayer(player, level, 'death');
      player.hurtTime = 0;
    }
  }
}
