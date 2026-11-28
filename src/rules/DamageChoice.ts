import { CATALOG, isCatalogSpell } from './Spellbook';
import type { QuickBinding } from './Spellbook';
import { isDamageType } from './DamageTypes';
import type { DamageType } from './DamageTypes';
import type { SpellDef } from './Spells';

/**
 * Spells whose caster picks the kind of damage (Chromatic Orb: acid, cold, fire, lightning, poison or thunder): the kinds
 * on offer are the spell's own in src/data/spellbook.json. The kind is chosen when the spell is bound to the quick bar
 * (ui/SpellsPanel.ts) and kept in the binding; casting it deals that kind (with what follows from it: thunder and lightning
 * charge water, fire sets grease alight).
 */

const NONE: readonly DamageType[] = [];

/** The kinds of damage a caster may pick for this spell (none when it deals one kind only). */
export function damageChoices(spell: string): readonly DamageType[] {
  if (!isCatalogSpell(spell)) return NONE;
  const types = CATALOG[spell].effect?.damageTypes ?? NONE;
  return types.length > 1 ? types : NONE;
}

/** Whether a binding may carry this damage type: none given, or one the spell offers. */
export function validChoice(spell: string, damageType: unknown): boolean {
  return damageType === undefined || (isDamageType(damageType) && damageChoices(spell).includes(damageType));
}

/** The damage type a bound spell deals: the one chosen for it, else the spell's own. */
export function boundDamageType(binding: Pick<QuickBinding, 'spell' | 'damageType'>, own: DamageType): DamageType {
  return binding.damageType && damageChoices(binding.spell).includes(binding.damageType) ? binding.damageType : own;
}

/** The spell as cast with the damage type chosen for it (the same spell when none was, or it offers no choice). */
export function withDamageType(def: SpellDef, damageType: DamageType | undefined): SpellDef {
  if (!damageType || damageType === def.damageType || !damageChoices(def.id).includes(damageType)) return def;
  return { ...def, damageType };
}
