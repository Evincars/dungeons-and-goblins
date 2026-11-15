import { q } from '../world';
import type { Mob } from '../world';
import type { Level } from '../level/Level';
import { formSquads, droppedThisTick } from '../ai/decision/squads';
import { assignRoles } from '../ai/decision/tactics';
import { surround } from '../ai/decision/surround';
import { agentOf } from '../ai/decision/states';
import { limping } from '../ai/execution/locomotion';
import { cheats } from '../game/Cheats';

/** Frozen by the console (/freeze): every enemy stops where it stands and thinks of nothing. */
function holdStill(): void {
  for (const mob of q.walkingMobs) {
    mob.velocity.x = 0;
    mob.velocity.y = 0;
  }
}

/** Whether the enemy gets to act this tick: alive, not stunned by a hit, and not on the lame beat of its limp. */
function canAct(mob: Mob): boolean {
  if (mob.removed || mob.health.current <= 0 || (mob.freezeTime ?? 0) > 0) return false;
  return !limping(mob);
}

/**
 * Enemy AI, in three steps: squads form around the players being fought (sharing what they see),
 * squad tactics hand out roles (Yuka Think) and places in the ring round the target, then every enemy runs a
 * tick of its state machine (Yuka StateMachine), which senses, decides and steers (Yuka Vehicle).
 */
export function updateAI(level: Level, tick: number): void {
  if (cheats.foesFrozen) {
    holdStill();
    return;
  }
  const squads = formSquads();
  for (const mob of droppedThisTick()) agentOf(mob).go('idle');
  assignRoles(squads, tick);
  for (const squad of squads.values()) surround(squad, tick);
  for (const mob of q.walkingMobs) {
    if (!canAct(mob)) continue;
    agentOf(mob).think(level, tick);
  }
}
