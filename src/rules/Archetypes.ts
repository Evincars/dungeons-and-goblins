import { hasStyle, isFightingStyle } from './FightingStyles';
import type { Styles } from './FightingStyles';
import type { DndClass } from './DndClasses';

/**
 * The subclasses a hero chooses once, in the level panel (src/rules/Build.ts):
 * the Fighter's Martial Archetypes of the Player's Handbook, at level 3:
 *   champion: weapon attacks that crit on a wider range of the d20, athletics, a second fighting style, survival.
 *   battle_master: superiority dice spent on maneuvers (src/rules/Maneuvers.ts).
 *   eldritch_knight: wizard spells (src/rules/KnightSpells.ts), cast between sword blows.
 * the Wizard's schools of magic (Arcane Traditions, as Baldur's Gate 3 has them), at level 2: abjuration, conjuration,
 * divination, enchantment, evocation, illusion, necromancy, transmutation and bladesinging (src/systems/SchoolSystem.ts).
 * A subclass's features are in src/data/features.json, marked `needs` its id.
 */
export const FIGHTER_ARCHETYPES = ['champion', 'battle_master', 'eldritch_knight'] as const;
export const WIZARD_SCHOOLS = [
  'abjuration', 'conjuration', 'divination', 'enchantment', 'evocation', 'illusion', 'necromancy', 'transmutation', 'bladesinging',
] as const;
export const ARCHETYPES = [...FIGHTER_ARCHETYPES, ...WIZARD_SCHOOLS] as const;
export type ArchetypeId = (typeof ARCHETYPES)[number];
export type WizardSchool = (typeof WIZARD_SCHOOLS)[number];

/**
 * The subclasses each class can follow for now. The Battle Master and the Eldritch Knight stay in the rules (and in old
 * builds), but are not offered; with only the Champion left, a Fighter is made a Champion on reaching level 3
 * (`grantArchetype` in src/rules/Build.ts). A Wizard picks any of the schools.
 */
const PLAYABLE = {
  fighter: ['champion'],
  wizard: WIZARD_SCHOOLS,
  rogue: [], warlock: [], bard: [], cleric: [],
} as const satisfies Record<DndClass, readonly ArchetypeId[]>;

export function playableArchetypes(cls: DndClass): readonly ArchetypeId[] {
  return PLAYABLE[cls];
}

export function isArchetype(value: unknown): value is ArchetypeId {
  return ARCHETYPES.some((id) => id === value);
}

export function isWizardSchool(value: unknown): value is WizardSchool {
  return WIZARD_SCHOOLS.some((id) => id === value);
}

/** What a hero chose that opens features: their fighting styles, their archetype (or school) and the maneuvers they know. */
export type Picks = Styles & { readonly archetype?: ArchetypeId; readonly maneuvers?: readonly string[] };

/** Words for a choice having been made at all: the first style, the second style, the archetype. */
export const CHOSEN_WORDS = ['style_chosen', 'extra_style_chosen', 'archetype_chosen'] as const;

/**
 * Whether the hero chose this style, archetype or maneuver (a build is a `Picks`; `undefined`: nothing chosen), or, by
 * one of the CHOSEN_WORDS, whether that choice has been made.
 */
export function hasPick(picks: Picks | null | undefined, id: string): boolean {
  if (!picks) return false;
  if (id === 'style_chosen') return picks.fightingStyle !== undefined;
  if (id === 'extra_style_chosen') return picks.extraStyle !== undefined;
  if (id === 'archetype_chosen') return picks.archetype !== undefined;
  if (picks.archetype === id || !!picks.maneuvers?.includes(id)) return true;
  return isFightingStyle(id) && hasStyle(picks, id);
}

/** The wizard school a hero studies (null: none chosen, or not a wizard's pick). */
export function schoolOf(picks: Picks | null | undefined): WizardSchool | null {
  const id = picks?.archetype;
  return isWizardSchool(id) ? id : null;
}
