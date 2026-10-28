/**
 * The Eldritch Knight's spellcasting (Player's Handbook): Intelligence, the wizard list, a third of a caster. The
 * tables are the archetype's own — cantrips and spells known by fighter level, and the levels at which spell slots of
 * each level open. The spells it may learn are checked against the catalog in src/rules/Spellbook.ts.
 */

/** The spell list key of an Eldritch Knight in the spell catalog (a class of its own, drawn from the wizard's). */
export const KNIGHT_LIST = 'eldritch_knight';

/** Spells known at fighter levels 3 to 20. */
const SPELLS_KNOWN = [3, 4, 4, 4, 5, 6, 6, 7, 8, 8, 9, 10, 10, 11, 11, 11, 12, 13] as const;
/** The fighter level an Eldritch Knight starts casting at. */
export const KNIGHT_FIRST_LEVEL = 3;

/** Cantrips known: 2 at level 3, 3 from level 10. */
const CANTRIP_TIERS = [{ level: 10, known: 3 }, { level: KNIGHT_FIRST_LEVEL, known: 2 }] as const;
/** The fighter levels at which slots of spell levels 1, 2, 3 and 4 open. */
export const KNIGHT_SLOT_LEVELS = [3, 7, 13, 19] as const;
/** The schools of the spells they learn (one level-3 spell, and the ones of levels 8, 14 and 20, may be of any school). */
export const KNIGHT_SCHOOLS = ['Abjuration', 'Evocation'] as const;
/** The fighter levels whose new spell may be of any school. */
export const FREE_SCHOOL_LEVELS = [3, 8, 14, 20] as const;

export function knightCantripsKnown(level: number): number {
  for (const tier of CANTRIP_TIERS) if (level >= tier.level) return tier.known;
  return 0;
}

export function knightSpellsKnown(level: number): number {
  if (level < KNIGHT_FIRST_LEVEL) return 0;
  return SPELLS_KNOWN[Math.min(level, KNIGHT_FIRST_LEVEL + SPELLS_KNOWN.length - 1) - KNIGHT_FIRST_LEVEL];
}

/** The highest spell level they have slots for (0 below level 3). */
export function knightSlotLevel(level: number): number {
  return KNIGHT_SLOT_LEVELS.filter((at) => level >= at).length;
}

/** How many of the spells known by this level may be of a school outside abjuration and evocation. */
export function freeSchoolPicks(level: number): number {
  return FREE_SCHOOL_LEVELS.filter((at) => level >= at).length;
}

/** The fighter levels at which an Eldritch Knight learns something new (the level panel marks them). */
export const KNIGHT_PICK_LEVELS: readonly number[] = Array.from({ length: SPELLS_KNOWN.length }, (_, i) => KNIGHT_FIRST_LEVEL + i)
  .filter((level) => knightSpellsKnown(level) > knightSpellsKnown(level - 1) || knightCantripsKnown(level) > knightCantripsKnown(level - 1));
