/**
 * Every kind of damage in the 5th edition rules, weapon and spell alike. Resistances, immunities and
 * vulnerabilities will be keyed by these, so anything that hurts names one of them.
 */

/** What blades, clubs and arrows do (the weapons table, src/rules/WeaponTable.ts). */
export const PHYSICAL_DAMAGE_TYPES = ['bludgeoning', 'piercing', 'slashing'] as const;
export type PhysicalDamageType = (typeof PHYSICAL_DAMAGE_TYPES)[number];

/** What spells, breath and poisons do. */
export const MAGICAL_DAMAGE_TYPES = ['acid', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'poison', 'psychic', 'radiant', 'thunder'] as const;
export type MagicalDamageType = (typeof MAGICAL_DAMAGE_TYPES)[number];

export const DAMAGE_TYPES = [...PHYSICAL_DAMAGE_TYPES, ...MAGICAL_DAMAGE_TYPES] as const;
export type DamageType = PhysicalDamageType | MagicalDamageType;

export function isDamageType(value: unknown): value is DamageType {
  return DAMAGE_TYPES.some((type) => type === value);
}

export function isMagicalDamageType(value: unknown): value is MagicalDamageType {
  return MAGICAL_DAMAGE_TYPES.some((type) => type === value);
}
