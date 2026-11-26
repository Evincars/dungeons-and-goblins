import { q, isActivePlayer, isPlayer } from '../world';
import type { Entity } from '../world';
import { nearby, Sense } from '../ai/perception/spatial';
import { CLOSE_QUARTERS_PX, isMeleeSpell, withDisadvantage, withinCloseQuarters } from '../rules/CloseQuarters';
import type { AttackProfile } from '../rules/Combat';

/**
 * Who presses a shooter (rules/CloseQuarters.ts): a hero is pressed by any live foe within 5 feet, an enemy by any hero on
 * their feet or raised undead fighting for them. Asked as a shot or a ranged spell leaves the hands, and kept on the
 * projectile (`pressed`), which then rolls with disadvantage when it strikes.
 */

const scratch: Entity[] = [];

/** Whether a live foe of the heroes stands within 5 feet of (x, y). */
function foeClose(x: number, y: number): boolean {
  for (const foe of nearby(x, y, CLOSE_QUARTERS_PX, Sense.mob, scratch)) {
    if ((foe.health?.current ?? 0) > 0 && foe.position && foe.mobType && withinCloseQuarters(x, y, foe.position.x, foe.position.y)) return true;
  }
  return false;
}

/** Whether a hero on their feet, or an undead of theirs, stands within 5 feet of (x, y). */
function heroClose(x: number, y: number): boolean {
  for (const hero of q.players) if (isActivePlayer(hero) && withinCloseQuarters(x, y, hero.position.x, hero.position.y)) return true;
  for (const undead of q.summons) if (undead.health.current > 0 && withinCloseQuarters(x, y, undead.position.x, undead.position.y)) return true;
  return false;
}

/** Whether a hostile creature stands within 5 feet of the shooter now (a melee spell attack is never pressed). */
export function pressedInMelee(shooter: Entity, spell?: string): boolean {
  const at = shooter.position;
  if (!at || isMeleeSpell(spell)) return false;
  return isPlayer(shooter) ? foeClose(at.x, at.y) : heroClose(at.x, at.y);
}

/** Marks a projectile just loosed by `shooter` as pressed, when a hostile creature stands within 5 feet of them. */
export function notePressed(projectile: Entity, shooter: Entity, spell?: string): void {
  if (projectile.projectile && pressedInMelee(shooter, spell)) projectile.projectile.pressed = true;
}

/** A shot's attack as rolled: at disadvantage when it flew past its normal range or was loosed in close quarters. */
export function shotAttack(projectile: NonNullable<Entity['projectile']>): AttackProfile {
  const far = projectile.closeLife !== undefined && projectile.life < projectile.closeLife;
  return far || projectile.pressed ? withDisadvantage(projectile.attack) : projectile.attack;
}
