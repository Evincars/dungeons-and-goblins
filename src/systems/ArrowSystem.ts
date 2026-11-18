import { q } from '../world';
import type { Player } from '../world';
import { sound } from '../audio/SoundPlayer';
import { createArrow } from '../entities/ProjectileFactory';
import { ARROW_STATS, ATTACK_PERIOD } from '../entities/WeaponStats';
import { ATTACK_RECOVERY } from '../characters/StateTriggers';
import { characterSheet, weaponInHand } from '../rules/CharacterSheet';
import { weaponRule } from '../rules/Equipment';
import { metresToPx } from '../rules/Scale';
import type { ShotReach } from '../entities/ProjectileFactory';
import { world } from '../world';
import { attackTempo } from './SwordSystem';
import { bladeAttack } from './SchoolSystem';

/**
 * Archery: a player fighting with a ranged weapon (bow, crossbow, sling, darts) shoots at the crosshair on
 * attack instead of swinging. The shot rolls to hit when it strikes; ammunition is never used up. Each weapon's
 * entry in src/data/weapons.json decides how far it shoots (past its normal range with disadvantage, up to its long
 * range) and whether it is `loading` (one shot per attack, Extra Attack or not).
 */

export function holdsBow(player: Player): boolean {
  return weaponRule(weaponInHand(player.equipped ?? {}) ?? undefined)?.rule.range === 'ranged';
}

function canShoot(player: Player): boolean {
  return !(player.arrowCooldown ?? 0) && player.health.current > 0 && !player.casting && !player.falling && !player.swordSwing;
}

/** How far the weapon in hand shoots, in pixels of the map (none for a weapon the table gives no range). */
function reachOf(player: Player): ShotReach | undefined {
  const distance = weaponRule(weaponInHand(player.equipped ?? {}) ?? undefined)?.rule.distance;
  return distance ? { normal: metresToPx(distance[0]), long: metresToPx(distance[1]) } : undefined;
}

/** Shots in one volley: one per attack the hero makes (Extra Attack), but a loading weapon fires once whatever. */
function volleySize(player: Player): number {
  const loading = weaponRule(weaponInHand(player.equipped ?? {}) ?? undefined)?.rule.properties.includes('loading');
  return loading ? 1 : characterSheet(player).attacks;
}

/** Looses one arrow at the crosshair, `followedBy` more to follow it in the same volley. */
function loose(player: Player, followedBy: number): void {
  const aim = player.aimVector ?? { x: 0, y: 1 };
  createArrow(player.position.x, player.position.y, aim.x, aim.y, characterSheet(player).attack, world.id(player), reachOf(player));
  player.volley = followedBy;
  // Hold the release pose for a moment (the attack clip plays while attackTime is above the recovery); half as long under Action Surge.
  player.attackTime = ATTACK_RECOVERY + Math.ceil(ARROW_STATS.drawTicks / attackTempo(player));
  sound.playSound('bow_shot', player.position.x, player.position.y);
  // Every arrow of a volley during the Bladesong gathers a Healing Charge for its Climax.
  bladeAttack(player);
}

/** Sharpshooter's earned shot: spent on the next volley of the attack key, one arrow more. */
function earnedShot(player: Player): number {
  if (!player.bonusAttack) return 0;
  player.bonusAttack = false;
  return 1;
}

/** A volley starts: the first arrow flies, the rest follow within the second, and the next volley is a second off. */
export function shoot(player: Player, followedBy = 0): void {
  player.arrowCooldown = ARROW_STATS.cooldown;
  loose(player, followedBy);
}

/**
 * Ticks between the arrows of a volley of `count`: the archer's own pace (the release pose and its recovery), twice as
 * fast under Action Surge, and quicker still only if the volley would not fit the attack period.
 */
function volleyGap(player: Player, count: number): number {
  const pace = Math.ceil((ARROW_STATS.drawTicks + ATTACK_RECOVERY) / attackTempo(player));
  return Math.max(1, Math.min(pace, Math.floor((ATTACK_PERIOD - 1) / Math.max(1, count))));
}

/** A shot that comes free of the attack key (War Magic, after a spell): one volley, if the hero is not shooting already. */
export function bonusShot(player: Player): boolean {
  if (!holdsBow(player) || !canShoot(player)) return false;
  shoot(player, volleySize(player) - 1);
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
  const count = volleySize(player);
  const due = ATTACK_PERIOD - Math.max(0, count - left) * volleyGap(player, count);
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
    if (canShoot(player)) shoot(player, volleySize(player) - 1 + earnedShot(player));
  }
}
