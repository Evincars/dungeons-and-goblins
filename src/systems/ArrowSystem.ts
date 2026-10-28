import { q } from '../world';
import type { Player } from '../world';
import { sound } from '../audio/SoundPlayer';
import { createArrow } from '../entities/ProjectileFactory';
import { ARROW_STATS, ATTACK_PERIOD } from '../entities/WeaponStats';
import { ATTACK_RECOVERY } from '../characters/StateTriggers';
import { characterSheet, weaponInHand } from '../rules/CharacterSheet';
import { weaponRule } from '../rules/Equipment';
import { world } from '../world';

/**
 * Archery: a player fighting with a ranged weapon (bow, crossbow, pistol, darts) shoots at the crosshair on
 * attack instead of swinging. The shot rolls to hit when it strikes; ammunition is never used up.
 */

export function holdsBow(player: Player): boolean {
  return weaponRule(weaponInHand(player.equipped ?? {}) ?? undefined)?.rule.range === 'ranged';
}

function canShoot(player: Player): boolean {
  return !(player.arrowCooldown ?? 0) && player.health.current > 0 && !player.casting && !player.falling && !player.swordSwing;
}

/** Looses one arrow at the crosshair, `followedBy` more to follow it in the same volley. */
function loose(player: Player, followedBy: number): void {
  const aim = player.aimVector ?? { x: 0, y: 1 };
  createArrow(player.position.x, player.position.y, aim.x, aim.y, characterSheet(player).attack, world.id(player));
  player.volley = followedBy;
  // Hold the release pose for a moment (the attack clip plays while attackTime is above the recovery).
  player.attackTime = ATTACK_RECOVERY + ARROW_STATS.drawTicks;
  sound.playSound('bow_shot', player.position.x, player.position.y);
}

/** A volley starts: the first arrow flies, the rest follow within the second, and the next volley is a second off. */
export function shoot(player: Player, followedBy = 0): void {
  player.arrowCooldown = ARROW_STATS.cooldown;
  loose(player, followedBy);
}

/** The arrows of a volley of `count` are spread evenly over the attack period. */
const volleyGap = (count: number): number => Math.floor(ATTACK_PERIOD / Math.max(1, count));

/** A shot that comes free of the attack key (War Magic, after a spell): one volley, if the hero is not shooting already. */
export function bonusShot(player: Player): boolean {
  if (!holdsBow(player) || !canShoot(player)) return false;
  shoot(player, characterSheet(player).attacks - 1);
  return true;
}

/** The rest of a volley: each arrow follows when its share of the second has run out, unless the bow has been put away or the archer has fallen. */
function followVolley(player: Player): void {
  const left = player.volley ?? 0;
  if (left <= 0) return;
  if (!holdsBow(player) || player.health.current <= 0) {
    player.volley = 0;
    return;
  }
  const count = characterSheet(player).attacks;
  const due = ATTACK_PERIOD - Math.max(0, count - left) * volleyGap(count);
  if ((player.arrowCooldown ?? 0) > due) return;
  loose(player, left - 1);
}

/**
 * Runs before the sword: with a bow in hand, attacking means shooting — the attack is used up even
 * while the bow is still drawing, so no swing slips in between shots. Extra Attack shoots a volley.
 */
export function updateArrows(): void {
  for (const player of q.players) {
    if ((player.arrowCooldown ?? 0) > 0) player.arrowCooldown = (player.arrowCooldown ?? 0) - 1;
    followVolley(player);
    const intents = player.playerInput.intents;
    if (!intents.attack || !holdsBow(player)) continue;
    intents.attack = false;
    if (canShoot(player)) shoot(player, characterSheet(player).attacks - 1);
  }
}
