import type { Entity } from '../world';
import type { CharacterState } from './CharacterDef';

/** States from most to least important; the first active one the character has a clip for plays. */
export const STATE_PRIORITY: readonly CharacterState[] = [
  'death', 'hurt', 'cast', 'runAttack', 'walkAttack', 'attack', 'run', 'walk', 'idle',
];

const MOVING_SPEED = 0.15;
/** Ticks a mob rests after a swing before it can start the next, so the attack clip can restart. */
export const ATTACK_RECOVERY = 10;

/** The swing clips: one blow played standing, walking or running. */
const SWINGS: ReadonlySet<CharacterState> = new Set(['attack', 'walkAttack', 'runAttack']);

/** Whether the state is one of the swing clips. */
export function isSwing(state: CharacterState): boolean {
  return SWINGS.has(state);
}

/** Whether both states are the same blow, so a swing in progress isn't restarted as the feet start or stop. */
export function sameSwing(a: CharacterState, b: CharacterState): boolean {
  return SWINGS.has(a) && SWINGS.has(b);
}

/** Whether the body is actually travelling (a chasing mob pressed against its target is not). */
function travelling(e: Entity): boolean {
  if (e.playerInput) return (e.walkTime ?? 0) > 0;
  return Math.hypot(e.velocity?.x ?? 0, e.velocity?.y ?? 0) > MOVING_SPEED;
}

function moving(e: Entity): boolean {
  // Players move by key input; everything else by how fast it is going, or by being on the hunt.
  return travelling(e) || (!e.playerInput && !!e.chasing);
}

/** Players run while sprinting; enemies run once they have spotted a player (fighting or tracking them). */
function running(e: Entity): boolean {
  const hurrying = e.playerInput ? !!e.playerStats?.sprinting : e.ai?.state === 'engage' || e.ai?.state === 'search';
  return hurrying && travelling(e);
}

function attacking(e: Entity): boolean {
  return !!e.swordSwing || (e.attackTime ?? 0) > ATTACK_RECOVERY;
}

/** Whether a one-shot that has played out still applies, so it must not replay (any swing counts while still attacking). */
export function stillTriggered(state: CharacterState, e: Entity): boolean {
  return SWINGS.has(state) ? attacking(e) : TRIGGERS[state](e);
}

/** What the rest of the simulation must look like for an entity to be in each state. */
export const TRIGGERS: Record<CharacterState, (e: Entity) => boolean> = {
  death: (e) => (e.health?.current ?? 1) <= 0 || e.respawnTicks !== undefined,
  hurt:  (e) => (e.hurtTime ?? 0) > 0,
  cast:  (e) => !!e.casting,
  runAttack:  (e) => attacking(e) && running(e),
  walkAttack: (e) => attacking(e) && travelling(e),
  attack: attacking,
  run:   (e) => running(e) && moving(e),
  walk:  moving,
  idle:  () => true,
};
