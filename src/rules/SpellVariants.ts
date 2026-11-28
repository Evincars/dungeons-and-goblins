import type { QuickBinding } from './Spellbook';

/**
 * Spells whose caster picks what they do when binding them, as Chromatic Orb's damage is picked (rules/DamageChoice.ts):
 * Blindness/Deafness blinds or deafens, as bound. The choice is made in the Skills tab (ui/SpellsPanel.ts: a row of boxes
 * before the level boxes), kept in the binding (`variant`) and cast with it (systems/SpellHolds.ts).
 */

export const SPELL_VARIANTS = ['blinded', 'deafened'] as const;
export type SpellVariant = (typeof SPELL_VARIANTS)[number];

export function isSpellVariant(value: unknown): value is SpellVariant {
  return SPELL_VARIANTS.some((v) => v === value);
}

/** The choices each such spell offers (the first is what it does when none was picked). */
const CHOICES: Readonly<Record<string, readonly SpellVariant[]>> = { blindness: ['blinded', 'deafened'] };
const NONE: readonly SpellVariant[] = [];

/** What a caster may pick for this spell when binding it (none for every other spell). */
export function variantChoices(spell: string): readonly SpellVariant[] {
  return CHOICES[spell] ?? NONE;
}

/** Whether a binding may carry this choice: none given, or one the spell offers. */
export function validVariant(spell: string, variant: unknown): boolean {
  return variant === undefined || (isSpellVariant(variant) && variantChoices(spell).includes(variant));
}

/** What a bound spell does: the choice kept in its binding, else the spell's first. */
export function boundVariant(binding: Pick<QuickBinding, 'spell' | 'variant'>): SpellVariant | undefined {
  const choices = variantChoices(binding.spell);
  if (binding.variant && choices.includes(binding.variant)) return binding.variant;
  return choices[0];
}
