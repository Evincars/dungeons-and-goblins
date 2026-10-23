import { world, Team } from '../world';
import type { Entity } from '../world';
import type { AttackProfile } from '../rules/Combat';
import { ARROW_STATS, SPELL_STATS } from './WeaponStats';

/** Height above the feet that the player aims from (also where spell bolts fly). */
export const AIM_HEIGHT = 22;

/** A spell bolt leaving the caster at (x, y) along the unit direction (dx, dy); `owner` is the caster's entity id. */
export function createSpellBolt(x: number, y: number, dx: number, dy: number, attack: AttackProfile, owner?: number): Entity {
  return world.add({
    position: { x: x + dx * SPELL_STATS.boltSpawnOffset, y: y + dy * SPELL_STATS.boltSpawnOffset },
    velocity: { x: dx * SPELL_STATS.boltSpeed, y: dy * SPELL_STATS.boltSpeed },
    projectile: { life: SPELL_STATS.boltLife, team: Team.Player, attack, owner },
    visual: { sheet: 'spell_bolt' },
    // Bolts travel at hand height above the ground they're tracked on.
    yOffset: AIM_HEIGHT,
    glow: { radius: SPELL_STATS.boltGlow },
  });
}

/** An arrow loosed from (x, y) along the unit direction (dx, dy), pointing the way it flies; `owner` is the archer's entity id. */
export function createArrow(x: number, y: number, dx: number, dy: number, attack: AttackProfile, owner?: number): Entity {
  return world.add({
    position: { x: x + dx * ARROW_STATS.spawnOffset, y: y + dy * ARROW_STATS.spawnOffset },
    velocity: { x: dx * ARROW_STATS.speed, y: dy * ARROW_STATS.speed },
    projectile: { life: ARROW_STATS.life, team: Team.Player, arrow: true, attack, owner },
    visual: { sheet: 'arrow_projectile', rotation: Math.atan2(dy, dx) },
    yOffset: AIM_HEIGHT,
  });
}

