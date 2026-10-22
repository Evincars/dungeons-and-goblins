import { q } from '../world';
import type { Player } from '../world';
import { sound } from '../audio/SoundPlayer';
import { createArrow } from '../entities/ProjectileFactory';
import { ARROW_STATS } from '../entities/WeaponStats';
import { statTotals } from '../entities/Items';
import { applyLoadout } from '../game/PlayerActions';
import { ATTACK_RECOVERY } from '../characters/StateTriggers';

/**
 * Archery: a player with arrows in the Arrows slot looses one at the crosshair on attack instead of
 * swinging. Each shot spends an arrow; the last one leaves the slot empty, and the sword is back.
 */

function quiver(player: Player): number {
  return player.equipped?.ammo?.count ?? 0;
}

function canShoot(player: Player): boolean {
  return !(player.arrowCooldown ?? 0) && player.health.current > 0 && !player.casting && !player.falling && !player.swordSwing;
}

/** Spends one arrow; an empty quiver comes off (and the gear's bonuses are worked out again). */
function spendArrow(player: Player): void {
  const equipped = player.equipped ?? {};
  const ammo = equipped.ammo;
  if (!ammo) return;
  ammo.count = (ammo.count ?? 1) - 1;
  if (ammo.count > 0) return;
  const rest = { ...equipped };
  delete rest.ammo;
  applyLoadout(player, { inventory: player.inventory ?? [], equipped: rest });
}

function shoot(player: Player): void {
  const aim = player.aimVector ?? { x: 0, y: 1 };
  const damage = ARROW_STATS.damage + statTotals(player.equipped ?? {}).strength;
  createArrow(player.position.x, player.position.y, aim.x, aim.y, damage);
  spendArrow(player);
  player.arrowCooldown = ARROW_STATS.cooldown;
  // Hold the release pose for a moment (the attack clip plays while attackTime is above the recovery).
  player.attackTime = ATTACK_RECOVERY + ARROW_STATS.drawTicks;
  sound.playSound('bow_shot', player.position.x, player.position.y);
}

/**
 * Runs before the sword: with arrows in the slot, attacking means shooting — the attack is used up even
 * while the bow is still drawing, so no swing slips in between shots.
 */
export function updateArrows(): void {
  for (const player of q.players) {
    if ((player.arrowCooldown ?? 0) > 0) player.arrowCooldown = (player.arrowCooldown ?? 0) - 1;
    const intents = player.playerInput.intents;
    if (!intents.attack || quiver(player) <= 0) continue;
    intents.attack = false;
    if (canShoot(player)) shoot(player);
  }
}
