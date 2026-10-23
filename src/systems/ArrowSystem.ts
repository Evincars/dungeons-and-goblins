import { q } from '../world';
import type { Player } from '../world';
import { sound } from '../audio/SoundPlayer';
import { createArrow } from '../entities/ProjectileFactory';
import { ARROW_STATS } from '../entities/WeaponStats';
import { ATTACK_RECOVERY } from '../characters/StateTriggers';
import { characterSheet, weaponInHand } from '../rules/CharacterSheet';
import { weaponRule } from '../rules/Equipment';
import { world } from '../world';

/**
 * Archery: a player fighting with a ranged weapon (bow, crossbow, pistol, darts) shoots at the crosshair on
 * attack instead of swinging. The shot rolls to hit when it strikes; ammunition is never used up.
 */

function holdsBow(player: Player): boolean {
  return weaponRule(weaponInHand(player.equipped ?? {}) ?? undefined)?.rule.range === 'ranged';
}

function canShoot(player: Player): boolean {
  return !(player.arrowCooldown ?? 0) && player.health.current > 0 && !player.casting && !player.falling && !player.swordSwing;
}

function shoot(player: Player): void {
  const aim = player.aimVector ?? { x: 0, y: 1 };
  createArrow(player.position.x, player.position.y, aim.x, aim.y, characterSheet(player).attack, world.id(player));
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
