import type { Entity } from '../world';
import { DAMAGE_TYPES, PHYSICAL_DAMAGE_TYPES } from './DamageTypes';
import type { DamageType } from './DamageTypes';
import { featureOn } from './ClassFeatures';

/**
 * Resistances and immunities to the kinds of damage (src/rules/DamageTypes.ts). A resistance halves the damage of its kind
 * (rounded down), an immunity takes all of it. What gives them: Blade Ward and Stoneskin (the damage of weapons: bludgeoning,
 * piercing and slashing), a necromancer's Inured to Undeath (necrotic). Nothing gives an immunity yet; when something does,
 * it goes in `immuneTo`.
 */

/** Who may resist: anything with the hero's lasting spells, their class features and their level. */
type Bearer = Pick<Entity, 'buffs'> & Partial<Pick<Entity, 'heroClass' | 'playerStats' | 'build' | 'featuresOff'>>;

const isPhysical = (type: DamageType): boolean => PHYSICAL_DAMAGE_TYPES.some((t) => t === type);

/** Features need a hero to ask about (a class and a level). */
function featureOf(who: Bearer, id: string): boolean {
  return !!who.heroClass && !!who.playerStats && featureOn({ heroClass: who.heroClass, playerStats: who.playerStats, build: who.build, featuresOff: who.featuresOff }, id);
}

/** Whether `who` takes half damage of this kind. */
export function resists(who: Bearer, type: DamageType): boolean {
  const buffs = who.buffs;
  if (isPhysical(type) && buffs && (buffs.bladeWard > 0 || buffs.stoneskin > 0)) return true;
  return type === 'necrotic' && featureOf(who, 'inured_to_undeath');
}

/** Whether `who` takes no damage of this kind (nothing gives an immunity yet). */
export function immuneTo(_who: Bearer, _type: DamageType): boolean {
  return false;
}

/** Damage of a kind as `who` takes it: none if immune, half (rounded down) if resistant, else all of it. */
export function damageTaken(who: Bearer, damage: number, type: DamageType): number {
  if (immuneTo(who, type)) return 0;
  return resists(who, type) ? Math.floor(damage / 2) : damage;
}

/** Every kind `who` resists and is immune to, for the character sheet (an immunity is not listed as a resistance too). */
export function defences(who: Bearer): { resist: DamageType[]; immune: DamageType[] } {
  const immune = DAMAGE_TYPES.filter((type) => immuneTo(who, type));
  const resist = DAMAGE_TYPES.filter((type) => !immune.includes(type) && resists(who, type));
  return { resist, immune };
}
