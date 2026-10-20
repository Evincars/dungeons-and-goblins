import { q } from '../world';
import type { Mob } from '../world';
import type { Level } from '../level/Level';
import { formSquads, droppedThisTick } from '../ai/decision/squads';
import { assignRoles } from '../ai/decision/tactics';
import { agentOf } from '../ai/decision/states';
import { limping } from '../ai/execution/locomotion';

/** Whether the enemy gets to act this tick: alive, not stunned by a hit, and not on the lame beat of its limp. */
function canAct(mob: Mob): boolean {
  if (mob.removed || mob.health.current <= 0 || (mob.freezeTime ?? 0) > 0) return false;
  return !limping(mob);
}

/**
 * Enemy AI, in three steps: squads form around the players being fought (sharing what they see),
 * squad tactics hand out roles (Yuka Think), then every enemy runs a tick of its state machine
 * (Yuka StateMachine), which senses, decides and steers (Yuka Vehicle).
 */
export function updateAI(level: Level, tick: number): void {
  const squads = formSquads();
  for (const mob of droppedThisTick()) agentOf(mob).go('idle');
  assignRoles(squads, tick);
  for (const mob of q.walkingMobs) {
    if (!canAct(mob)) continue;
    agentOf(mob).think(level, tick);
  }
}
