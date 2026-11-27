/**
 * The D&D conditions the game plays (SRD), and the creature types the monsters are of. A monster's block names which
 * conditions it is immune to (src/data/stats.json `defences.conditions`): a specter floats, so it never falls prone; an undead
 * cannot be lulled to sleep.
 */

export const CONDITIONS = [
  'prone', 'unconscious', 'paralyzed', 'incapacitated', 'charmed', 'frightened', 'blinded', 'deafened', 'poisoned', 'restrained', 'invisible',
] as const;
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

/**
 * What a spell holds a body in (systems/SpellHolds.ts), heroes and foes alike: paralysed (Hold Person), in fits of laughter
 * (Tasha's Hideous Laughter: prone and incapacitated), blinded or deafened (Blindness/Deafness), enfeebled (Ray of
 * Enfeeblement: half damage with Strength weapons), maddened (Crown of Madness: it attacks the creature nearest it other than
 * its charmer) and restrained (Web).
 */
export const HOLD_KINDS = ['paralyzed', 'laughing', 'blinded', 'deafened', 'enfeebled', 'maddened', 'restrained'] as const;
export type HoldKind = (typeof HOLD_KINDS)[number];

export function isHoldKind(value: unknown): value is HoldKind {
  return HOLD_KINDS.some((k) => k === value);
}

/** The tabletop condition a creature must not be immune to for each hold to take it (its monster block's `conditions`). */
export const HOLD_CONDITION = {
  paralyzed: 'paralyzed', laughing: 'prone', blinded: 'blinded', deafened: 'deafened', enfeebled: null, maddened: 'charmed', restrained: 'restrained',
} as const satisfies Record<HoldKind, Condition | null>;
