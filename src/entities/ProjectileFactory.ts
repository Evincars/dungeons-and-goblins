import { world, Team } from '../world';
import type { Entity, ProjectileBurst } from '../world';
import { characterDef, clipSheetKey } from '../characters/Characters';
import type { BoltDef, CharacterDef } from '../characters/CharacterDef';
import type { AttackProfile } from '../rules/Combat';
import { ARROW_STATS, SPELL_STATS } from './WeaponStats';

/** Height above the feet that the player aims from (also where spell bolts fly). */
export const AIM_HEIGHT = 22;

/**
 * A spell bolt leaving the caster at (x, y) along the unit direction (dx, dy); `owner` is the caster's entity
 * id. A caster with spell art of their own (`character`'s bolt: Vesper's fireball, Xanthia's light orb) flies
 * it, turned the way it goes, and bursts in its frames; anyone else casts the plain bolt.
 */
export function createSpellBolt(x: number, y: number, dx: number, dy: number, attack: AttackProfile, owner?: number, character?: string): Entity {
  const bolt = character ? characterDef(character).bolt : undefined;
  const def = character ? characterDef(character) : undefined;
  const flight: Partial<Entity> = bolt && def ? boltArt(def, bolt, dx, dy) : { visual: { sheet: 'spell_bolt' } };
  return world.add({
    position: { x: x + dx * SPELL_STATS.boltSpawnOffset, y: y + dy * SPELL_STATS.boltSpawnOffset },
    velocity: { x: dx * SPELL_STATS.boltSpeed, y: dy * SPELL_STATS.boltSpeed },
    projectile: { life: SPELL_STATS.boltLife, team: Team.Player, attack, owner, burst: bolt && def ? boltBurst(def, bolt) : undefined },
    ...flight,
    // Bolts travel at hand height above the ground they're tracked on.
    yOffset: AIM_HEIGHT,
    glow: { radius: SPELL_STATS.boltGlow },
  });
}

/** A caster's own bolt: its flight frames looping, turned along (dx, dy). */
function boltArt(def: CharacterDef, bolt: BoltDef, dx: number, dy: number): Partial<Entity> {
  const sheet = clipSheetKey(def, bolt.clip);
  return {
    visual: { sheet, scale: bolt.scale, rotation: Math.atan2(dy, dx) },
    animation: { sheet, firstFrame: bolt.fly.first, frameX: 0, frameY: 0, frameCount: bolt.fly.count, frameTime: def.clips[bolt.clip].frameTime, timer: 0, loop: true },
  };
}

function boltBurst(def: CharacterDef, bolt: BoltDef): ProjectileBurst | undefined {
  if (!bolt.burst) return undefined;
  return { sheet: clipSheetKey(def, bolt.clip), first: bolt.burst.first, count: bolt.burst.count, frameTime: def.clips[bolt.clip].frameTime, scale: bolt.scale };
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

