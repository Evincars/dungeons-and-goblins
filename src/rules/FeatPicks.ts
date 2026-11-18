import { FEATS } from './Feats';
import type { FeatId, FeatPicks } from './Feats';
import { CATALOG } from './Spellbook';
import type { CatalogSpell } from './Spellbook';
import { WEAPON_BASES } from './WeaponTable';
import type { WeaponBase } from './WeaponTable';
import { weaponProficient } from './Classes';
import type { HeroClass } from './Classes';
import { damageTypeName, weaponName } from './Names';

/**
 * What a player picks with a feat (src/data/feats.json `picks`), and whether a choice is a fair one: Magic Initiate's
 * cantrips and 1st-level spell from one class's list, Spell Sniper's damaging cantrip, Weapon Master's four weapons, an
 * Elemental Adept's damage type. The level panel offers them (ui/FeatPicks.ts); the host checks what comes back.
 */

/** One thing on offer: what it is (a spell, a weapon or a damage type), its name, and whether it may be picked. */
export type PickOption = { id: string; name: string; group: 'cantrip' | 'spell' | 'weapon' | 'element'; open: boolean; spell?: CatalogSpell };

/** A spell of the list the feat teaches from (and, for Spell Sniper, one that deals damage). */
function teaches(picks: Extract<FeatPicks, { kind: 'spells' }>, spell: CatalogSpell): boolean {
  if (spell.level > 1 || (spell.level === 0 ? picks.cantrips : picks.spells) <= 0) return false;
  if (picks.from && spell.classes[picks.from] === undefined) return false;
  return !picks.damaging || spell.effect?.kind === 'damage';
}

/** The cantrips first, then the spells, each by name: only the game's castable ones may be picked. */
function spellOptions(picks: Extract<FeatPicks, { kind: 'spells' }>): PickOption[] {
  return Object.values(CATALOG)
    .filter((spell) => teaches(picks, spell))
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
    .map((spell) => ({ id: spell.id, name: spell.name, group: spell.level === 0 ? 'cantrip' : 'spell', open: spell.castable, spell }));
}

/** Every weapon of the game; those the hero is trained in already (by class or another feat) can't be picked. */
function weaponOptions(cls: HeroClass, trained: readonly string[]): PickOption[] {
  return WEAPON_BASES.filter((base) => base !== 'unarmed')
    .map((base: WeaponBase) => ({ id: base, name: weaponName(base), group: 'weapon' as const, open: !weaponProficient(cls, base, trained) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** What the feat offers this hero to pick (none for a feat without picks). `trained`: weapons other feats train them in. */
export function pickOptions(cls: HeroClass, feat: FeatId, trained: readonly string[] = []): PickOption[] {
  const picks = FEATS[feat].picks;
  if (!picks) return [];
  if (picks.kind === 'spells') return spellOptions(picks);
  if (picks.kind === 'weapons') return weaponOptions(cls, trained);
  return picks.options.map((type) => ({ id: type, name: damageTypeName(type), group: 'element', open: true }));
}

/**
 * How many of each group the feat asks for, never more than `options` has open (a cleric's list has one cantrip the game
 * casts yet, so Magic Initiate (Cleric) asks for that one).
 */
export function picksWanted(feat: FeatId, options: readonly PickOption[]): { cantrip: number; spell: number; weapon: number; element: number } {
  const picks = FEATS[feat].picks;
  const open = (group: PickOption['group']): number => options.filter((option) => option.group === group && option.open).length;
  const wanted = { cantrip: 0, spell: 0, weapon: 0, element: 0 };
  if (picks?.kind === 'spells') return { ...wanted, cantrip: Math.min(picks.cantrips, open('cantrip')), spell: Math.min(picks.spells, open('spell')) };
  if (picks?.kind === 'weapons') return { ...wanted, weapon: Math.min(picks.count, open('weapon')) };
  if (picks?.kind === 'element') return { ...wanted, element: Math.min(1, open('element')) };
  return wanted;
}

/** The choice is exactly what the feat asks for: as many of each group, all different, each one on offer and open. */
export function picksFit(cls: HeroClass, feat: FeatId, picks: readonly string[], trained: readonly string[] = []): boolean {
  if (new Set(picks).size !== picks.length) return false;
  const options = pickOptions(cls, feat, trained);
  const chosen = picks.map((id) => options.find((option) => option.id === id));
  if (chosen.some((option) => !option?.open)) return false;
  const wanted = picksWanted(feat, options);
  const count = (group: PickOption['group']): number => chosen.filter((option) => option?.group === group).length;
  return count('cantrip') === wanted.cantrip && count('spell') === wanted.spell && count('weapon') === wanted.weapon && count('element') === wanted.element;
}

/** Whether the feat has anything to pick. */
export function featHasPicks(feat: FeatId): boolean {
  return FEATS[feat].picks !== null;
}
