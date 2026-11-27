import type { Entity, StatName } from '../world';
import type { DamageType } from './DamageTypes';
import type { Dice } from './Dice';
import { plus } from './Dice';
import { weaponStats } from './WeaponTable';
import type { WeaponRule } from './WeaponTable';
import type { WeaponAttack } from './CharacterSheet';

/**
 * Spells that change the weapon in a hero's hand (src/data/spells.json):
 * - Magic Weapon: a weapon with no magic of its own becomes a magic one, +1 to attack and damage rolls (+2 cast at the 4th
 *   level, +3 at the 6th), for as long as the caster's concentration holds;
 * - Shadow Blade: a sword of solidified gloom in the hand — a simple melee weapon the hero is trained in, finesse, light and
 *   thrown, dealing 2d8 psychic damage (3d8 cast at the 3rd or 4th level, 4d8 at the 5th or 6th, 5d8 higher); it strikes at
 *   advantage at a target in dim light or darkness (systems/Strike.ts).
 * A sword floats over the head of a hero who has either (systems/WeaponSignSystem.ts).
 */

/** Shadow Blade is shaped as a shortsword, and its dice are d8s. */
const BLADE_SHAPE = 'shortsword';
const BLADE_SIDES = 8;
const BLADE_TYPE: DamageType = 'psychic';
/** Its dice: 2 at the 2nd level, one more for every two levels it is cast above, 5 at most. */
const BLADE_BASE_DICE = 2;
const BLADE_MAX_DICE = 5;
const BLADE_LEVELS_PER_DIE = 2;
/** Magic Weapon's bonus: +1, +2 cast at the 4th level, +3 at the 6th. */
const WEAPON_BONUS_LEVELS = [4, 6] as const;

/** Shadow Blade's d8s when cast at this level. */
export function bladeDice(castLevel: number): number {
  return Math.min(BLADE_MAX_DICE, BLADE_BASE_DICE + Math.floor((Math.max(2, castLevel) - 1) / BLADE_LEVELS_PER_DIE));
}

/** Magic Weapon's bonus when cast at this level. */
export function weaponBonus(castLevel: number): number {
  return 1 + WEAPON_BONUS_LEVELS.filter((level) => castLevel >= level).length;
}

type SpellBuffs = Entity['buffs'];
type Modifiers = Readonly<Record<StatName, number>>;

/** Whether the hero holds a Shadow Blade now. */
export function holdsShadowBlade(buffs: SpellBuffs): boolean {
  return !!buffs && (buffs.shadowBlade ?? 0) > 0;
}

/** The kind of damage the hero's weapon blows deal while a spell shapes it: Shadow Blade's psychic, else the weapon's own. */
export function bladeDamageType(hero: Pick<Entity, 'buffs'>): DamageType | undefined {
  return holdsShadowBlade(hero.buffs) ? BLADE_TYPE : undefined;
}

/** Shadow Blade's rule: a shortsword's, with its dice, psychic, finesse, light and thrown. */
function bladeRule(dice: number): WeaponRule {
  const shape = weaponStats(BLADE_SHAPE);
  // Its psychic damage is told where it strikes (bladeDamageType): the table's rule keeps a weapon's kind.
  return { ...shape, damage: { count: dice, sides: BLADE_SIDES, bonus: 0 }, category: 'simple', properties: ['finesse', 'light', 'thrown'] };
}

/** The attack with a Shadow Blade in hand: the better of STR and DEX, the proficiency bonus, its dice. */
function bladeAttack(attack: WeaponAttack, modifiers: Modifiers, proficiency: number, dice: number): WeaponAttack {
  const ability = modifiers.dexterity > modifiers.strength ? 'dexterity' : 'strength';
  const mod = modifiers[ability];
  const rule = bladeRule(dice);
  const base: Dice = rule.damage;
  return {
    ...attack, item: null, base: BLADE_SHAPE, rule, ability, abilityModifier: mod, abilityDamage: mod, abilityHit: mod, magic: 0,
    styleHit: 0, styleDamage: 0, styleName: null, featHit: 0, featDamage: 0, featName: null, proficiency, proficient: true, twoHanded: false,
    damage: plus(base, mod), attackBonus: proficiency + mod,
  };
}

/** A weapon with no magic of its own made magic: its bonus to hit and to damage. */
function magicAttack(attack: WeaponAttack, bonus: number): WeaponAttack {
  if (attack.magic > 0 || bonus <= 0 || attack.base === 'unarmed') return attack;
  return { ...attack, magic: bonus, damage: plus(attack.damage, bonus), attackBonus: attack.attackBonus + bonus };
}

/** The hero's weapon attack as the spells on them shape it: a Shadow Blade in place of the weapon, else Magic Weapon's bonus. */
export function withSpellWeapon(attack: WeaponAttack, buffs: SpellBuffs, modifiers: Modifiers, proficiency: number): WeaponAttack {
  if (!buffs) return attack;
  if (holdsShadowBlade(buffs)) return bladeAttack(attack, modifiers, proficiency, buffs.bladeDice ?? BLADE_BASE_DICE);
  return (buffs.magicWeapon ?? 0) > 0 ? magicAttack(attack, buffs.weaponBonus ?? 1) : attack;
}
