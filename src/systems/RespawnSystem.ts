import { world } from '../world';
import type { Entity } from '../world';
import { stateDuration } from '../characters/Characters';
import { partyFallen } from '../game/Fallen';
import { run } from '../game/Run';

/** Ticks the fallen hero lies there after the death clip has finished, before their death counts as played out. */
const DEATH_LINGER = 45;

const dying = world.with('playerInput', 'respawnTicks');

/**
 * Starts a hero's death: the death clip plays out (`respawnTicks` counts it down), and then they lie where they fell
 * until the party goes deeper (game/Fallen.ts).
 */
export function startDying(player: Entity): void {
  const clipTicks = player.character ? stateDuration(player.character.def, 'death') + DEATH_LINGER : 0;
  world.addComponent(player, 'respawnTicks', clipTicks);
  world.removeComponent(player, 'casting');
  world.removeComponent(player, 'swordSwing');
  player.hurtTime = 0;
  player.flashTime = 0;
}

/** The fallen play their deaths out; once the whole party is down, the run is over. */
export function updateRespawns(dt: number): void {
  for (const player of dying) player.respawnTicks = Math.max(0, player.respawnTicks - dt);
  if (partyFallen()) run.over = true;
}
