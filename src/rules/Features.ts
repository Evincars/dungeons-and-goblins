/**
 * The class features the game plays out (a Fighter's fighting style is a choice, see FightingStyles.ts); a class's progression (src/data/classes.json) hands them out by level.
 * sneak_attack (Rogue): +1d6 damage at level 1, one more die every two levels, with a finesse or ranged weapon
 *   (the tabletop rule asks for advantage or an ally beside the target; a real-time fight grants it on every such blow).
 * jack_of_all_trades (Bard): half the proficiency bonus (rounded down) is added to initiative.
 * disciple_of_life (Life Cleric): a healing spell mends 2 + the spell's level more.
 * agonizing_blast (Warlock invocation): Eldritch Blast adds the CHA modifier to its damage.
 */
export const CLASS_FEATURES = [
  'sneak_attack', 'jack_of_all_trades', 'disciple_of_life', 'agonizing_blast',
] as const;
export type ClassFeature = (typeof CLASS_FEATURES)[number];

export function isClassFeature(value: unknown): value is ClassFeature {
  return CLASS_FEATURES.some((f) => f === value);
}
