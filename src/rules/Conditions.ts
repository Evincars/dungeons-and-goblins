/**
 * The D&D conditions the game plays (SRD), and the creature types the monsters are of. A monster's block names which
 * conditions it is immune to (src/data/stats.json `defences.conditions`): a specter floats, so it never falls prone; an undead
 * cannot be lulled to sleep.
 */

export const CONDITIONS = ['prone', 'unconscious', 'charmed', 'frightened', 'blinded', 'poisoned', 'restrained'] as const;
export type Condition = (typeof CONDITIONS)[number];

export function isCondition(value: unknown): value is Condition {
  return CONDITIONS.some((c) => c === value);
}

/** The SRD creature types. */
export const CREATURE_TYPES = [
  'aberration', 'beast', 'celestial', 'construct', 'dragon', 'elemental', 'fey', 'fiend', 'giant', 'humanoid', 'monstrosity',
  'ooze', 'plant', 'undead',
] as const;
export type CreatureType = (typeof CREATURE_TYPES)[number];

export function isCreatureType(value: unknown): value is CreatureType {
  return CREATURE_TYPES.some((c) => c === value);
}

/** The creatures Protection from Evil and Good wards against: they attack the warded at disadvantage. */
const OTHERWORLDLY: ReadonlySet<CreatureType> = new Set<CreatureType>(['aberration', 'celestial', 'elemental', 'fey', 'fiend', 'undead']);

export function isOtherworldly(type: CreatureType): boolean {
  return OTHERWORLDLY.has(type);
}
