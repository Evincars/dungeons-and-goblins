import { hasStyle, isFightingStyle } from './FightingStyles';
import type { Styles } from './FightingStyles';

/**
 * The Fighter's Martial Archetypes of the Player's Handbook, chosen once at level 3 in the level panel (src/rules/Build.ts):
 * champion: weapon attacks that crit on a wider range of the d20, athletics, a second fighting style, survival.
 * battle_master: superiority dice spent on maneuvers (src/rules/Maneuvers.ts).
 * eldritch_knight: wizard spells (src/rules/KnightSpells.ts), cast between sword blows.
 * An archetype's features are in src/data/features.json, marked `needs` the archetype's id.
 */
export const ARCHETYPES = ['champion', 'battle_master', 'eldritch_knight'] as const;
export type ArchetypeId = (typeof ARCHETYPES)[number];

export function isArchetype(value: unknown): value is ArchetypeId {
  return ARCHETYPES.some((id) => id === value);
}

/** What a hero chose that opens features: their fighting styles, their archetype and the maneuvers they know. */
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
