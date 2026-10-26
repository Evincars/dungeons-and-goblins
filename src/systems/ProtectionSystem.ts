import { q, isActivePlayer } from '../world';
import type { Player } from '../world';
import { isShield } from '../rules/Equipment';
import { featureOn } from '../rules/ClassFeatures';
import { PROTECTION_COOLDOWN_TICKS, PROTECTION_REACH } from '../rules/FightingStyles';
import { logLine } from './RollLogSystem';
import { text } from '../core/texts';

/**
 * The Protection fighting style, a passive: a hero who carries a shield and chose it makes an enemy's attack on
 * the ally standing closest to them (within 5 feet) be rolled with disadvantage. It then needs a few seconds
 * before it protects again (`protectCooldown`, shown in the HUD's top left corner).
 */

/** Carrying the style, a shield, and able to act. */
export function canProtect(hero: Player): boolean {
  return featureOn(hero, 'protection') && isShield(hero.equipped?.secondary) && isActivePlayer(hero);
}

/** The ally closest to the hero within reach, if any (every other player is an ally). */
export function protectedAlly(hero: Player): Player | undefined {
  let closest: Player | undefined;
  let best = PROTECTION_REACH;
  for (const other of q.players) {
    if (other === hero || !isActivePlayer(other)) continue;
    const dist = Math.hypot(other.position.x - hero.position.x, other.position.y - hero.position.y);
    if (dist > best) continue;
    best = dist;
    closest = other;
  }
  return closest;
}

/**
 * An enemy is about to attack `ally`: the hero whose Protection covers them and is ready spends it, and the
 * attack must be rolled with disadvantage. Returns whether it was.
 */
export function protectFrom(ally: Player): boolean {
  for (const hero of q.players) {
    if (hero === ally || (hero.protectCooldown ?? 0) > 0 || !canProtect(hero) || protectedAlly(hero) !== ally) continue;
    hero.protectCooldown = PROTECTION_COOLDOWN_TICKS;
    logLine(hero, text('roll.protection'), 'hit');
    return true;
  }
  return false;
}

/** Each hero's Protection recovers a tick. */
export function updateProtection(): void {
  for (const hero of q.players) if ((hero.protectCooldown ?? 0) > 0) hero.protectCooldown = (hero.protectCooldown ?? 0) - 1;
}
