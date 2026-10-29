import type { StatName } from '../world';

/** The D&D classes the heroes belong to (a leaf module: rules that read class data at load time depend on it, not on the whole of Classes.ts). */
export const DND_CLASSES = ['fighter', 'wizard', 'rogue', 'warlock', 'bard', 'cleric'] as const;
export type DndClass = (typeof DND_CLASSES)[number];

/**
 * Each class's primary ability, from the class tables of the SRD: what its hero leans on most (a caster's is its
 * spellcasting ability). A Fighter's is Strength or Dexterity, whichever the hero has built on.
 */
export const PRIMARY_ABILITIES = {
  fighter: ['strength', 'dexterity'],
  wizard: ['intelligence'],
  rogue: ['dexterity'],
  warlock: ['charisma'],
  bard: ['charisma'],
  cleric: ['wisdom'],
} as const satisfies Record<DndClass, readonly StatName[]>;
