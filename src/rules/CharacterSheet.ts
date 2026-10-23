import type { EquipSlot, InventoryItem, MobType, Player, StatName } from '../world';
import { abilities, proficiencyBonus } from './Abilities';
import type { Abilities } from './Abilities';
import { UNARMORED_AC } from './ArmorTable';
import type { ArmorBase, ArmorRule } from './ArmorTable';
import { WEAPON_TABLE } from './WeaponTable';
import type { WeaponBase, WeaponRule } from './WeaponTable';
import { plus } from './Dice';
import type { D20Mode, Dice } from './Dice';
import { armorRule, isShield, magicBonus, weaponRule } from './Equipment';
import { armorProficient, hasFeature, heroClass, weaponProficient } from './Classes';
import type { ClassFeature, HeroClass } from './Classes';
import { MONSTERS } from './Monsters';
import { nextLevelXp } from '../game/Progress';

/**
 * What the rules make of a character's class, gear and abilities: Armor Class, the damage and attack bonus
 * of the weapon in hand, and hit points, worked out the way the tabletop game does.
 */

type Equipped = Partial<Record<EquipSlot, InventoryItem>>;
type Modifiers = Readonly<Record<StatName, number>>;

/** The Fighter's Defense style: this much AC while wearing armour. */
const DEFENSE_STYLE_AC = 1;

export type ArmorClass = {
  total: number;
  /** The body armour worn and its table entry (null with none on). */
  armor: { item: InventoryItem; base: ArmorBase; category: ArmorRule['category'] } | null;
  /** The AC before DEX: 10 with no armour, else the armour's own. */
  base: number;
  /** The part of the DEX modifier that counts (heavy armour: none; medium: at most +2). */
  dex: number;
  /** The armour's magic bonus. */
  magic: number;
  /** What the shield adds, its magic included (0 with none). */
  shield: number;
  /** A class feature's share (Unarmored Defense's CON, the Defense style's +1), and which feature. */
  feature: number;
  featureName: ClassFeature | null;
  /** Trained in the armour and shield worn; untrained, every attack roll has disadvantage. */
  proficient: boolean;
};

/** Heavy armour ignores DEX either way; medium lets at most +2 of it count; light and none, all of it. */
function countedDex(rule: ArmorRule | null, dex: number): number {
  if (!rule) return dex;
  if (rule.category === 'heavy') return 0;
  return rule.dexCap === null ? dex : Math.min(dex, rule.dexCap);
}

/** The shield carried in the second hand, if any. */
function shieldOf(equipped: Equipped): InventoryItem | undefined {
  return isShield(equipped.secondary) ? equipped.secondary : undefined;
}

/** What a class feature adds to AC: Unarmored Defense (CON with no armour) or the Defense style (+1 in armour). */
function featureAC(cls: HeroClass | null, armored: boolean, modifiers: Modifiers): { feature: number; featureName: ClassFeature | null } {
  if (cls && !armored && hasFeature(cls, 'unarmored_defense')) return { feature: modifiers.constitution, featureName: 'unarmored_defense' };
  if (cls && armored && hasFeature(cls, 'fighting_style_defense')) return { feature: DEFENSE_STYLE_AC, featureName: 'fighting_style_defense' };
  return { feature: 0, featureName: null };
}

/**
 * Armor Class: 10 + DEX bare, or the armour's AC (+ the DEX it allows), plus magic, a shield and the class's
 * feature. `cls` null: a creature without a class (no features, trained in everything).
 */
export function armorClass(equipped: Equipped, modifiers: Modifiers, cls: HeroClass | null = null): ArmorClass {
  const worn = armorRule(equipped.armor);
  const rule = worn && worn.rule.category !== 'shield' ? worn.rule : null;
  const armor = rule && worn && equipped.armor ? { item: equipped.armor, base: worn.base, category: rule.category } : null;
  const base = rule ? rule.ac : UNARMORED_AC;
  const dex = countedDex(rule, modifiers.dexterity);
  const magic = magicBonus(armor?.item);
  const shieldItem = shieldOf(equipped);
  const shield = shieldItem ? (armorRule(shieldItem)?.rule.ac ?? 0) + magicBonus(shieldItem) : 0;
  const { feature, featureName } = featureAC(cls, !!armor, modifiers);
  const proficient = !cls || ((!armor || armorProficient(cls, armor.category)) && (!shieldItem || armorProficient(cls, 'shield')));
  return { total: base + dex + magic + shield + feature, armor, base, dex, magic, shield, feature, featureName, proficient };
}

export type WeaponAttack = {
  /** The weapon in hand (null when fighting bare-handed or for an enemy) and the table entry it fights as. */
  item: InventoryItem | null;
  base: WeaponBase;
  rule: WeaponRule;
  /** The ability that drives it, and that ability's modifier. */
  ability: Extract<StatName, 'strength' | 'dexterity'>;
  abilityModifier: number;
  magic: number;
  /** The proficiency bonus added to hit (0 when untrained in the weapon), and whether the wielder is trained. */
  proficiency: number;
  proficient: boolean;
  /** A versatile weapon held in both hands (the other hand empty) deals its larger dice. */
  twoHanded: boolean;
  /** The damage roll, every bonus added, and extra dice of another size rolled with it (a rogue's Sneak Attack). */
  damage: Dice;
  extra?: Dice;
  /** What is added to the d20 to hit, and how the d20 is rolled (disadvantage in untrained armour). */
  attackBonus: number;
  mode: D20Mode;
};

/** The weapon a character fights with: the primary hand's, else a weapon in the second hand. */
export function weaponInHand(equipped: Equipped): InventoryItem | null {
  if (weaponRule(equipped.primary)) return equipped.primary ?? null;
  return weaponRule(equipped.secondary) ? equipped.secondary ?? null : null;
}

/** Melee weapons use STR, ranged ones DEX; finesse weapons whichever is better. */
function attackAbility(rule: WeaponRule, modifiers: Modifiers): WeaponAttack['ability'] {
  if (rule.properties.includes('finesse')) return modifiers.dexterity > modifiers.strength ? 'dexterity' : 'strength';
  return rule.range === 'ranged' ? 'dexterity' : 'strength';
}

/** The other hand is free (nothing in it), so a versatile weapon can be held in both. */
function otherHandFree(equipped: Equipped, item: InventoryItem | null): boolean {
  const other = equipped.primary === item ? equipped.secondary : equipped.primary;
  return !other;
}

type Wielding = { item: InventoryItem | null; base: WeaponBase; twoHanded: boolean; proficiency: number; mode: D20Mode };

/** Dice + ability modifier + magic to damage; d20 + proficiency + the same modifier + magic to hit. */
function attackWith(w: Wielding, modifiers: Modifiers): WeaponAttack {
  const rule: WeaponRule = WEAPON_TABLE[w.base];
  const ability = attackAbility(rule, modifiers);
  const abilityModifier = modifiers[ability];
  const magic = magicBonus(w.item ?? undefined);
  const dice = w.twoHanded && rule.versatile ? rule.versatile : rule.damage;
  return {
    item: w.item, base: w.base, rule, ability, abilityModifier, magic,
    proficiency: w.proficiency, proficient: w.proficiency > 0, twoHanded: w.twoHanded,
    damage: plus(dice, abilityModifier + magic),
    attackBonus: w.proficiency + abilityModifier + magic,
    mode: w.mode,
  };
}

/**
 * The attack of the weapon in hand; bare-handed it is a punch (1 + STR). Untrained in the weapon, no
 * proficiency bonus; in untrained armour (`armorProficient` false), the d20 is rolled with disadvantage.
 */
export function weaponAttack(equipped: Equipped, modifiers: Modifiers, level: number, cls: HeroClass | null = null, armorTrained = true): WeaponAttack {
  const item = weaponInHand(equipped);
  const found = weaponRule(item ?? undefined);
  const base: WeaponBase = found?.base ?? 'unarmed';
  const rule: WeaponRule = WEAPON_TABLE[base];
  const trained = !cls || weaponProficient(cls, base);
  const twoHanded = !!rule.versatile && !!item && otherHandFree(equipped, item);
  const mode: D20Mode = armorTrained ? 'normal' : 'disadvantage';
  const attack = attackWith({ item, base, twoHanded, proficiency: trained ? proficiencyBonus(level) : 0, mode }, modifiers);
  if (cls && hasFeature(cls, 'sneak_attack') && sneaky(rule)) attack.extra = SNEAK_ATTACK;
  return attack;
}

/** Sneak Attack's dice at level 1, and the weapons that allow it: finesse or ranged. */
const SNEAK_ATTACK: Dice = { count: 1, sides: 6, bonus: 0 };
function sneaky(rule: WeaponRule): boolean {
  return rule.range === 'ranged' || rule.properties.includes('finesse');
}

/** An enemy's attack with the weapon it carries: its monster block's proficiency and abilities. */
export function monsterAttack(type: MobType, weapon: WeaponBase): WeaponAttack {
  const monster = MONSTERS[type];
  return attackWith({ item: null, base: weapon, twoHanded: false, proficiency: monster.proficiency, mode: 'normal' }, monster.modifiers);
}

/** A walker's pace in the tabletop game (feet a round), and what heavy armour too heavy for its wearer takes off. */
export const BASE_SPEED_FT = 30;
const HEAVY_ARMOR_SLOW_FT = 10;
/** Passive checks and spell save DCs are a fixed base plus the bonuses: 10 for a passive check, 8 for a DC. */
const PASSIVE_BASE = 10;
const SPELL_DC_BASE = 8;

/** A saving throw: the ability modifier, plus proficiency for the class's two trained saves. */
export type SavingThrow = { bonus: number; proficient: boolean };

/** A hero's spellcasting: the ability it uses, d20 + this to hit with a spell, and the DC foes must beat. */
export type Spellcasting = { ability: StatName; attack: number; dc: number; trained: boolean };

export type CharacterSheet = Abilities & {
  heroClass: HeroClass;
  level: number;
  /** The proficiency bonus at this level (+2 from 1 to 4). */
  proficiency: number;
  armorClass: ArmorClass;
  attack: WeaponAttack;
  hitPoints: { current: number; max: number };
  /** Hit dice left to spend, of one a level. */
  hitDice: { left: number; total: number };
  /** Experience points so far, and those the next level needs (null at the highest). */
  experience: { xp: number; next: number | null };
  /** Who acts first: d20 + this (the DEX modifier). */
  initiative: number;
  /** Feet a round in the tabletop game. */
  speed: number;
  /** What the hero notices without looking: 10 + WIS. */
  passivePerception: number;
  saves: Record<StatName, SavingThrow>;
  spell: Spellcasting;
};

/** Each ability's saving throw; the class's saves add the proficiency bonus. */
function savingThrows(modifiers: Modifiers, cls: HeroClass, proficiency: number): Record<StatName, SavingThrow> {
  const save = (stat: StatName): SavingThrow => {
    const proficient = cls.savingThrows.includes(stat);
    return { bonus: modifiers[stat] + (proficient ? proficiency : 0), proficient };
  };
  return {
    strength: save('strength'), dexterity: save('dexterity'), constitution: save('constitution'),
    intelligence: save('intelligence'), wisdom: save('wisdom'), charisma: save('charisma'),
  } satisfies Record<StatName, SavingThrow>;
}

/** Heavy armour slows a wearer without the STR it asks for by 10 ft. */
function speedIn(ac: ArmorClass, scores: Readonly<Record<StatName, number>>): number {
  const needs = ac.armor ? armorRule(ac.armor.item)?.rule.strength : undefined;
  return needs !== undefined && scores.strength < needs ? BASE_SPEED_FT - HEAVY_ARMOR_SLOW_FT : BASE_SPEED_FT;
}

/** Spells use the class's casting ability (anyone else: Intelligence, untrained but still proficient in the attack). */
function spellcasting(cls: HeroClass, modifiers: Modifiers, proficiency: number): Spellcasting {
  const ability = cls.spellcasting ?? 'intelligence';
  return { ability, attack: proficiency + modifiers[ability], dc: SPELL_DC_BASE + proficiency + modifiers[ability], trained: cls.spellcasting !== null };
}

/** Everything the inventory's character sheet shows, from the player's class and what they wear. */
export function characterSheet(player: Pick<Player, 'equipped' | 'playerStats' | 'health' | 'heroClass'>): CharacterSheet {
  const equipped = player.equipped ?? {};
  const cls = heroClass(player.heroClass);
  const scores = abilities(equipped, cls.abilities);
  const ac = armorClass(equipped, scores.modifiers, cls);
  const level = player.playerStats.level;
  const proficiency = proficiencyBonus(level);
  return {
    ...scores,
    heroClass: cls,
    level,
    proficiency,
    armorClass: ac,
    attack: weaponAttack(equipped, scores.modifiers, level, cls, ac.proficient),
    hitPoints: { current: player.health.current, max: player.health.max },
    hitDice: { left: player.playerStats.hitDice, total: level },
    experience: { xp: player.playerStats.exp, next: nextLevelXp(level) },
    initiative: scores.modifiers.dexterity,
    speed: speedIn(ac, scores.scores),
    passivePerception: PASSIVE_BASE + scores.modifiers.wisdom,
    saves: savingThrows(scores.modifiers, cls, proficiency),
    spell: spellcasting(cls, scores.modifiers, proficiency),
  };
}
