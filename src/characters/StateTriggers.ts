import type { Entity } from '../world';
import type { CharacterState } from './CharacterDef';

/** States from most to least important; the first active one the character has a clip for plays. */
export const STATE_PRIORITY: readonly CharacterState[] = ['death', 'hurt', 'cast', 'attack', 'run', 'walk', 'idle'];

const MOVING_SPEED = 0.15;
/** Ticks a mob rests after a swing before it can start the next, so the attack clip can restart. */
export const ATTACK_RECOVERY = 10;

function moving(e: Entity): boolean {
  // Players move by key input; everything else by how fast it is actually going.
  if (e.playerInput) return (e.walkTime ?? 0) > 0;
  return !!e.chasing || Math.hypot(e.velocity?.x ?? 0, e.velocity?.y ?? 0) > MOVING_SPEED;
}

/** What the rest of the simulation must look like for an entity to be in each state. */
export const TRIGGERS: Record<CharacterState, (e: Entity) => boolean> = {
  death: (e) => (e.health?.current ?? 1) <= 0 || e.respawnTicks !== undefined,
  hurt:  (e) => (e.hurtTime ?? 0) > 0,
  cast:  (e) => !!e.casting,
  attack: (e) => !!e.swordSwing || (e.attackTime ?? 0) > ATTACK_RECOVERY,
  run:   (e) => !!e.playerStats?.sprinting && moving(e),
  walk:  moving,
  idle:  () => true,
};
