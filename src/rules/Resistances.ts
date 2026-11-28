import type { Entity } from '../world';
import { DAMAGE_TYPES, PHYSICAL_DAMAGE_TYPES } from './DamageTypes';
import type { DamageType } from './DamageTypes';
import { featureOn } from './ClassFeatures';
import type { MobType } from '../world';
import { MONSTERS } from './Monsters';

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

// ── Monsters ──────────────────────────────────────────────────────────────────

/**
 * How a monster meets a kind of damage (src/data/stats.json `defences`, SRD): immune (none of it), resistant (half),
 * vulnerable (double) or neither. Weapon damage it resists only from nonmagical weapons counts as resisted unless the blow
 * is magical (a +1 weapon, a spell). Prepared for play, not applied yet: hitMob records the kind (`lastDamageType`).
 */
export type DamageResponse = 'immune' | 'resistant' | 'vulnerable' | 'normal';

export function monsterResponse(type: MobType, damageType: DamageType, magical: boolean): DamageResponse {
  const d = MONSTERS[type].defences;
  if (d.immune.includes(damageType)) return 'immune';
  const nonmagical = !magical && d.resistNonmagical.some((t) => t === damageType);
  if (d.resist.includes(damageType) || nonmagical) return 'resistant';
  return d.vulnerable.includes(damageType) ? 'vulnerable' : 'normal';
}

/** Damage as a monster that meets it so takes it: none, half (rounded down), double, or all of it. */
export function adjustDamage(damage: number, response: DamageResponse): number {
  if (response === 'immune') return 0;
  if (response === 'resistant') return Math.floor(damage / 2);
  return response === 'vulnerable' ? damage * 2 : damage;
}

/** The damage a monster of this kind would take of a blow (what play will apply once the defences are switched on). */
export function monsterDamageTaken(type: MobType, damage: number, damageType: DamageType, magical: boolean): number {
  return adjustDamage(damage, monsterResponse(type, damageType, magical));
}
