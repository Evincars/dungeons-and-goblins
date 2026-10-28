import { world } from '../world';
import type { Entity } from '../world';
import { sound } from '../audio/SoundPlayer';
import { MOB_CRIES } from '../audio/SoundBank';
import { SWORD_STATS } from '../entities/WeaponStats';

/** A mob that takes a hit flinches (can't act) for this long, and shows hurt for this long. */
const MOB_FREEZE_TICKS = 6;
const MOB_HURT_TICKS = 40;

/**
 * Applies a hit to a target and shoves them back (`evenIfFlinching`: land even while it flinches from the last one).
 * An enemy cries out when a hit catches it unhurt and leaves it standing (the blow itself is the caller's to sound:
 * a blade, an arrow or a spell).
 */
export function hitMob(mob: Entity, attacker: Entity, damage: number, evenIfFlinching = false): void {
  const h = mob.health;
  if (!h || h.current <= 0) return;
  // A flinching target shrugs off a second blow in the same instant — but not a spell's darts or blast.
  if ((mob.freezeTime ?? 0) > 0 && !evenIfFlinching) return;

  const flinched = (mob.hurtTime ?? 0) > 0;
  // The kill (and its coins) goes to whoever struck last: a projectile's shooter, not the projectile.
  mob.lastHitBy = attacker.projectile?.owner ?? world.id(attacker);
  mob.hurtTime = MOB_HURT_TICKS;
  mob.attackTime = 0;
  mob.freezeTime = MOB_FREEZE_TICKS;
  h.current = Math.max(0, h.current - damage);

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
