import { world, Team } from '../world';
import type { Entity } from '../world';
import { SPELL_STATS } from './WeaponStats';

/** Height above the feet that the player aims from (also where spell bolts fly). */
export const AIM_HEIGHT = 22;

/** A spell bolt leaving the caster at (x, y) along the unit direction (dx, dy). */
export function createSpellBolt(x: number, y: number, dx: number, dy: number): Entity {
  return world.add({
    position: { x: x + dx * SPELL_STATS.boltSpawnOffset, y: y + dy * SPELL_STATS.boltSpawnOffset },
    velocity: { x: dx * SPELL_STATS.boltSpeed, y: dy * SPELL_STATS.boltSpeed },
    projectile: { damage: SPELL_STATS.boltDamage, life: SPELL_STATS.boltLife, team: Team.Player },
    visual: { sheet: 'spell_bolt' },
    // Bolts travel at hand height above the ground they're tracked on.
    yOffset: AIM_HEIGHT,
    glow: { radius: SPELL_STATS.boltGlow },
  });
}
