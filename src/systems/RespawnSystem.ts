import { world } from '../world';
import type { Entity } from '../world';
import type { Level } from '../level/Level';
import { stateDuration } from '../characters/Characters';
import { respawnPlayer } from './HoleSystem';

/** Ticks the fallen player lies there after the death clip has finished. */
const DEATH_LINGER = 45;

const dying = world.with('playerInput', 'respawnTicks');

/** Starts a player's death: plays the death clip out, then {@link updateRespawns} brings them back. */
export function startDying(player: Entity, level: Level): void {
  const clipTicks = player.character ? stateDuration(player.character.def, 'death') : 0;
  if (clipTicks === 0) {
    respawnPlayer(player, level, 'death');
    return;
  }
  world.addComponent(player, 'respawnTicks', clipTicks + DEATH_LINGER);
  world.removeComponent(player, 'casting');
  world.removeComponent(player, 'swordSwing');
  player.hurtTime = 0;
  player.flashTime = 0;
}

export function updateRespawns(level: Level, dt: number): void {
  for (const player of dying) {
    player.respawnTicks = Math.max(0, player.respawnTicks - dt);
    if (player.respawnTicks > 0) continue;
    world.removeComponent(player, 'respawnTicks');
    respawnPlayer(player, level, 'death');
    player.hurtTime = 0;
  }
}
