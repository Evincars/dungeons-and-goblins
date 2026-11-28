import { world } from '../world';
import { logHurt } from './RollLogSystem';
import type { Entity } from '../world';
import type { DamageType } from '../rules/DamageTypes';
import { sound } from '../audio/SoundPlayer';
import { MOB_CRIES } from '../audio/SoundBank';
import { wake } from './SleepSpell';
import { shakeOff } from './SpellHolds';
import { afflict } from './Afflictions';
import { woundedFurther } from './WeaponMarks';
import { SWORD_STATS } from '../entities/WeaponStats';

/** A mob that takes a hit flinches (can't act) for this long, and shows hurt for this long. */
const MOB_FREEZE_TICKS = 6;
const MOB_HURT_TICKS = 40;

/**
 * Applies a hit to a target and shoves them back (`evenIfFlinching`: land even while it flinches from the last one). The
 * kind of damage, when given, is kept on it (`lastDamageType`: its
 * resistances, rules/Resistances.ts, once they are applied).
 * An enemy cries out when a hit catches it unhurt and leaves it standing (the blow itself is the caller's to sound:
 * a blade, an arrow or a spell).
 */
export function hitMob(mob: Entity, attacker: Entity, damage: number, evenIfFlinching = false, type?: DamageType): void {
  const h = mob.health;
  if (!h || h.current <= 0) return;
  if (type) mob.lastDamageType = type;
  // A flinching target shrugs off a second blow in the same instant — but not a spell's darts or blast.
  if ((mob.freezeTime ?? 0) > 0 && !evenIfFlinching) return;

  const flinched = (mob.hurtTime ?? 0) > 0;
  // The kill (and its coins) goes to whoever struck last: a projectile's shooter, not the projectile; an undead's master.
  mob.lastHitBy = attacker.projectile?.owner ?? attacker.summon?.owner ?? world.id(attacker);
  mob.hurtTime = MOB_HURT_TICKS;
  mob.attackTime = 0;
  mob.freezeTime = MOB_FREEZE_TICKS;
  // The hero who dealt it is credited with what it took (for the level's summary).
  const credited = mob.lastHitBy === undefined ? undefined : world.entity(mob.lastHitBy);
  // Gaping Wounds take 2 piercing damage more, and the hurt ends Off Balance (systems/WeaponMarks.ts).
  const dealt = woundedFurther(mob, damage);
  if (credited?.playerStats) credited.playerStats.damageDealt += Math.min(dealt, h.current);
  h.current = Math.max(0, h.current - dealt);
  // The damage over its head, in red (with its kind, unless a weapon's).
  logHurt(mob, dealt, type);
  // A blow breaks a charm (Hypnotic Gaze, an illusion's hold) and wakes a sleeper.
  if (mob.status) mob.status.charmed = 0;
  wake(mob);
  // Fits of laughter may be shaken off; fire, poison, acid, cold and lightning leave their mark for a round.
  shakeOff(mob);
  afflict(mob, type);

  const ap = attacker.position;
  const mp = mob.position;
  if (ap && mp) {
    const dx = mp.x - ap.x;
    const dy = mp.y - ap.y;
    const dist = Math.hypot(dx, dy) || 1;
    mob.bump ??= { x: 0, y: 0 };
    mob.bump.x = (dx / dist) * SWORD_STATS.knockback;
    mob.bump.y = (dy / dist) * SWORD_STATS.knockback;
  }

  if (mob.mobType && mp && !flinched && h.current > 0) sound.playSound(MOB_CRIES[mob.mobType].hurt, mp.x, mp.y);
}
