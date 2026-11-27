import type { Entity, Mob } from '../world';
import { SIGHT_RANGE } from '../ai/constants';
import { heldIn, holdOf, nearestOther } from './SpellHolds';

/**
 * Crown of Madness (systems/SpellHolds.ts `maddened`): a twisted crown of iron on its head and madness in its eyes, the
 * charmed foe goes for the creature nearest it other than its charmer — friend or foe — and strikes it (systems/CombatSystem.ts),
 * instead of thinking for itself. With nobody of its own side near, it fights as before, but never its charmer.
 */

/** A maddened foe stops walking once its body is this near its victim's (px), and strikes it. */
const CLOSE_ENOUGH = 4;

/** The creature a maddened foe goes for now: the nearest other foe it could see, if any. */
export function madTarget(mob: Entity): Entity | undefined {
  return heldIn(mob, 'maddened') ? nearestOther(mob, SIGHT_RANGE) : undefined;
}

/** Whether the maddened foe must spare this hero: the one who charmed it. */
export function sparedBy(mob: Entity, heroId: number | undefined): boolean {
  return holdOf(mob, 'maddened')?.by === heroId;
}

/** A maddened foe's tick instead of its own thinking: it walks for its victim. Returns whether it went mad (false: it thinks). */
export function followMadness(mob: Mob): boolean {
  const victim = madTarget(mob);
  if (!victim?.position) return false;
  const dx = victim.position.x - mob.position.x;
  const dy = victim.position.y - mob.position.y;
  const dist = Math.hypot(dx, dy) || 1;
  mob.aimVector ??= { x: 0, y: 1 };
  mob.aimVector.x = dx / dist;
  mob.aimVector.y = dy / dist;
  if (dist <= mob.radius.x + (victim.radius?.x ?? 0) + CLOSE_ENOUGH) return true;
  const speed = mob.speed ?? 0;
  mob.velocity.x += (dx / dist) * speed;
  mob.velocity.y += (dy / dist) * speed;
  return true;
}
