import { q } from '../world';
import type { Player } from '../world';
import { sound } from '../audio/SoundPlayer';
import { createArrow } from '../entities/ProjectileFactory';
import { ARROW_STATS } from '../entities/WeaponStats';
import { statTotals } from '../entities/Items';
import { ATTACK_RECOVERY } from '../characters/StateTriggers';

/** Weapon kinds (see src/data/weapons.json) that loose arrows instead of swinging. */
const ARROW_WEAPONS: readonly string[] = ['bow', 'crossbow'];

/**
 * Archery: a player holding a bow in either hand looses an arrow at the crosshair on attack instead of
 * swinging. Arrows are never used up.
 */

function holdsBow(player: Player): boolean {
  const { primary, secondary } = player.equipped ?? {};
  return ARROW_WEAPONS.includes(primary?.kind ?? '') || ARROW_WEAPONS.includes(secondary?.kind ?? '');
}

function canShoot(player: Player): boolean {
  return !(player.arrowCooldown ?? 0) && player.health.current > 0 && !player.casting && !player.falling && !player.swordSwing;
}

function shoot(player: Player): void {
  const aim = player.aimVector ?? { x: 0, y: 1 };
  const damage = ARROW_STATS.damage + statTotals(player.equipped ?? {}).strength;
  createArrow(player.position.x, player.position.y, aim.x, aim.y, damage);
  player.arrowCooldown = ARROW_STATS.cooldown;
  // Hold the release pose for a moment (the attack clip plays while attackTime is above the recovery).
  player.attackTime = ATTACK_RECOVERY + ARROW_STATS.drawTicks;
  sound.playSound('bow_shot', player.position.x, player.position.y);
}

/**
 * Runs before the sword: with a bow in hand, attacking means shooting — the attack is used up even
 * while the bow is still drawing, so no swing slips in between shots.
 */
export function updateArrows(): void {
  for (const player of q.players) {
    if ((player.arrowCooldown ?? 0) > 0) player.arrowCooldown = (player.arrowCooldown ?? 0) - 1;
    const intents = player.playerInput.intents;
    if (!intents.attack || !holdsBow(player)) continue;
    intents.attack = false;
    if (canShoot(player)) shoot(player);
  }
}
