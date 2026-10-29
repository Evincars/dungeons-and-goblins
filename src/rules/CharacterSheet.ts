import type { EquipSlot, InventoryItem, MobType, Player, StatName } from '../world';
import { abilities, proficiencyBonus } from './Abilities';
import type { Abilities } from './Abilities';
import { UNARMORED_AC } from './ArmorTable';
import type { ArmorBase, ArmorRule } from './ArmorTable';
import { WEAPON_TABLE } from './WeaponTable';
import type { WeaponBase, WeaponRule } from './WeaponTable';
import { NATURAL_CRIT, plus } from './Dice';
import type { D20Mode, Dice } from './Dice';
import { armorRule, isShield, magicBonus, weaponRule } from './Equipment';
import { armorProficient, heroClass, weaponProficient } from './Classes';
import { classHasFeature } from './ClassFeatures';
import type { HeroClass } from './Classes';
import { PRIMARY_ABILITIES } from './DndClasses';
import { baseScores, featInitiative } from './Build';
import type { Build } from './Build';
import {
  ARCHERY_ATTACK_BONUS, DEFENSE_ARMOR_CLASS, DUELING_DAMAGE_BONUS, GREAT_WEAPON_REROLL_BELOW, hasStyle,
} from './FightingStyles';
import type { FightingStyleId, Styles } from './FightingStyles';
import type { Picks } from './Archetypes';
import { MONSTERS } from './Monsters';
import { nextLevelXp } from '../game/Progress';
import { MANEUVER_DC_BASE } from './Maneuvers';

/**
 * What the rules make of a character's class, gear and abilities: Armor Class, the damage and attack bonus
 * of the weapon in hand, and hit points, worked out the way the tabletop game does.
 */

type Equipped = Partial<Record<EquipSlot, InventoryItem>>;
type Modifiers = Readonly<Record<StatName, number>>;

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
  /** The Defense fighting style's share (+1 in armour), and the style it came from. */
  feature: number;
  featureName: FightingStyleId | null;
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

/** What a fighting style adds to AC: Defense gives +1 in armour. */
function featureAC(styles: Styles | null, armored: boolean): { feature: number; featureName: FightingStyleId | null } {
  if (hasStyle(styles, 'defense') && armored) return { feature: DEFENSE_ARMOR_CLASS, featureName: 'defense' };
  return { feature: 0, featureName: null };
}

/**
 * Armor Class: 10 + DEX bare, or the armour's AC (+ the DEX it allows), plus magic, a shield and the class's
 * fighting style. `cls` null: a creature without a class (no features, trained in everything).
 */
export function armorClass(equipped: Equipped, modifiers: Modifiers, cls: HeroClass | null = null, styles: Styles | null = null): ArmorClass {
  const worn = armorRule(equipped.armor);
  const rule = worn && worn.rule.category !== 'shield' ? worn.rule : null;
  const armor = rule && worn && equipped.armor ? { item: equipped.armor, base: worn.base, category: rule.category } : null;
  const base = rule ? rule.ac : UNARMORED_AC;
  const dex = countedDex(rule, modifiers.dexterity);
  const magic = magicBonus(armor?.item);
  const shieldItem = shieldOf(equipped);
  const shield = shieldItem ? (armorRule(shieldItem)?.rule.ac ?? 0) + magicBonus(shieldItem) : 0;
  const { feature, featureName } = featureAC(styles, !!armor);
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
  /** Damage dice showing this or less are rolled again (Great Weapon Fighting). */
  rerollBelow?: number;
  /** What is added to the d20 to hit, and how the d20 is rolled (disadvantage in untrained armour). */
  attackBonus: number;
  mode: D20Mode;
  /** The lowest d20 that is a critical hit (20, or less for a Champion's Improved and Superior Critical). */
  critFrom: number;
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
    critFrom: NATURAL_CRIT,
  };
}

/**
 * The attack of the weapon in hand; bare-handed it is a punch (1 + STR). Untrained in the weapon, no
 * proficiency bonus; in untrained armour (`armorProficient` false), the d20 is rolled with disadvantage.
 */
export function weaponAttack(equipped: Equipped, modifiers: Modifiers, level: number, cls: HeroClass | null = null, armorTrained = true, styles: Picks | null = null, off: readonly string[] = []): WeaponAttack {
  const item = weaponInHand(equipped);
  const found = weaponRule(item ?? undefined);
  const base: WeaponBase = found?.base ?? 'unarmed';
  const rule: WeaponRule = WEAPON_TABLE[base];
  const trained = !cls || weaponProficient(cls, base);
  const twoHanded = !!rule.versatile && !!item && otherHandFree(equipped, item);
  const mode: D20Mode = armorTrained ? 'normal' : 'disadvantage';
  const attack = attackWith({ item, base, twoHanded, proficiency: trained ? proficiencyBonus(level) : 0, mode }, modifiers);
  const has = (id: string): boolean => !!cls && classHasFeature(cls.dndClass, level, id, styles) && !off.includes(id);
  if (has('sneak_attack') && sneaky(rule)) attack.extra = sneakAttackDice(level);
  if (has('divine_strike')) attack.extra = divineStrikeDice(level);
  attack.critFrom = criticalFrom(has);
  return withFightingStyle(attack, equipped, styles);
}

/** A Champion's weapon attacks are critical hits from a 19 (Improved Critical) or an 18 (Superior Critical). */
const IMPROVED_CRIT_FROM = 19;
const SUPERIOR_CRIT_FROM = 18;
function criticalFrom(has: (id: string) => boolean): number {
  if (has('superior_critical')) return SUPERIOR_CRIT_FROM;
  return has('improved_critical') ? IMPROVED_CRIT_FROM : NATURAL_CRIT;
}

/** Extra Attack: attacks in one swing from this hero level on (2 at level 5, 3 at 11, 4 at 20). */
const EXTRA_ATTACK_TIERS = [{ level: 20, attacks: 4 }, { level: 11, attacks: 3 }, { level: 5, attacks: 2 }] as const;

/** How many weapon attacks one swing (or one volley of arrows) makes: one, more with Extra Attack. */
export function attacksPerAction(cls: HeroClass | null, level: number, off: readonly string[] = [], picks: Picks | null = null): number {
  if (!cls || !classHasFeature(cls.dndClass, level, 'extra_attack', picks) || off.includes('extra_attack')) return 1;
  for (const tier of EXTRA_ATTACK_TIERS) if (level >= tier.level) return tier.attacks;
  return 1;
}

/** Whether the item is a melee weapon that one hand can hold beside another (a two-handed weapon needs both). */
function handWeapon(item: InventoryItem | undefined): boolean {
  const found = weaponRule(item);
  return !!found && found.rule.range === 'melee' && !found.rule.properties.includes('two_handed');
}

/**
 * Fighting with a weapon in each hand: one click makes a second attack with the one in the second hand, rolled on its own
 * (its own d20 and its own damage). It adds no ability modifier to its damage (unless that is a penalty) — except for a
 * hero with the Two-Weapon Fighting style. Null when the hero does not hold a melee weapon in both hands.
 */
export function offHandAttack(equipped: Equipped, modifiers: Modifiers, level: number, cls: HeroClass | null = null, armorTrained = true, styles: Styles | null = null): WeaponAttack | null {
  const item = equipped.secondary;
  const found = weaponRule(item);
  if (!item || !found || !handWeapon(equipped.primary) || !handWeapon(item)) return null;
  const trained = !cls || weaponProficient(cls, found.base);
  const attack = attackWith({ item, base: found.base, twoHanded: false, proficiency: trained ? proficiencyBonus(level) : 0, mode: armorTrained ? 'normal' : 'disadvantage' }, modifiers);
  if (!hasStyle(styles, 'two_weapon_fighting') && attack.abilityModifier > 0) attack.damage = plus(attack.damage, -attack.abilityModifier);
  return attack;
}

/** The other hand holds no weapon (a shield or nothing). */
function otherHandWeaponless(equipped: Equipped, item: InventoryItem | null): boolean {
  const other = equipped.primary === item ? equipped.secondary : equipped.primary;
  return !weaponRule(other);
}

/**
 * What the fighting style does to this blow: Archery adds to ranged attack rolls, Dueling to the damage of a melee
 * weapon held in one hand alone, Great Weapon Fighting rerolls low damage dice of a melee weapon in two hands.
 */
function withFightingStyle(attack: WeaponAttack, equipped: Equipped, styles: Styles | null): WeaponAttack {
  const melee = attack.rule.range === 'melee';
  if (hasStyle(styles, 'archery') && !melee) attack.attackBonus += ARCHERY_ATTACK_BONUS;
  const oneHanded = melee && !attack.twoHanded && !attack.rule.properties.includes('two_handed') && attack.base !== 'unarmed';
  if (hasStyle(styles, 'dueling') && oneHanded && otherHandWeaponless(equipped, attack.item)) attack.damage = plus(attack.damage, DUELING_DAMAGE_BONUS);
  const bothHands = melee && (attack.twoHanded || attack.rule.properties.includes('two_handed'));
  if (hasStyle(styles, 'great_weapon_fighting') && bothHands) attack.rerollBelow = GREAT_WEAPON_REROLL_BELOW;
  return attack;
}

/** Sneak Attack's d6s: one at level 1 and another every two levels (a level-20 rogue rolls ten). */
const SNEAK_ATTACK_SIDES = 6;
/** A Divine Strike adds 1d8 radiant damage to a weapon blow, 2d8 from this level. */
const DIVINE_STRIKE_SIDES = 8;
const DIVINE_STRIKE_UPGRADE_LEVEL = 14;
const divineStrikeDice = (level: number): Dice => ({ count: level >= DIVINE_STRIKE_UPGRADE_LEVEL ? 2 : 1, sides: DIVINE_STRIKE_SIDES, bonus: 0 });
const sneakAttackDice = (level: number): Dice => ({ count: Math.ceil(Math.max(1, level) / 2), sides: SNEAK_ATTACK_SIDES, bonus: 0 });
/** The weapons that allow Sneak Attack: finesse or ranged. */
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
  /** The ability scores before gear: the class's, plus what the levels gained so far added. */
  baseScores: Readonly<Record<StatName, number>>;
  armorClass: ArmorClass;
  attack: WeaponAttack;
  /** The off-hand attack of fighting with a weapon in each hand (null: not holding a melee weapon in both). */
  offHand: WeaponAttack | null;
  /** Weapon attacks in one swing: one, more with Extra Attack (the off-hand blow comes on top). */
  attacks: number;
  hitPoints: { current: number; max: number };
  /** Hit dice left to spend, of one a level. */
  hitDice: { left: number; total: number };
  /** Experience points so far, and those the next level needs (null at the highest). */
  experience: { xp: number; next: number | null };
  /** The saving throw DC of a Battle Master's maneuvers: 8 + proficiency + the better of STR and DEX. */
  maneuverDc: number;
  /** Whether the hero is a Battle Master (the sheet tells their maneuver DC). */
  battleMaster: boolean;
  /** Who acts first: d20 + this (the DEX modifier, plus Jack of All Trades and the Alert feat). */
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
function spellcasting(cls: HeroClass, modifiers: Modifiers, proficiency: number, knight: boolean): Spellcasting {
  const ability = cls.spellcasting ?? 'intelligence';
  return { ability, attack: proficiency + modifiers[ability], dc: SPELL_DC_BASE + proficiency + modifiers[ability], trained: cls.spellcasting !== null || knight };
}

/**
 * The abilities to mark on the sheet for this hero: their class's primary ability (of two, the one with the higher
 * score, Strength on a tie) and, for anyone who casts spells, their spellcasting ability.
 */
export function keyAbilities(sheet: Pick<CharacterSheet, 'heroClass' | 'scores' | 'spell'>): ReadonlySet<StatName> {
  const keys = new Set<StatName>();
  let best: StatName | null = null;
  for (const stat of PRIMARY_ABILITIES[sheet.heroClass.dndClass]) {
    if (best === null || sheet.scores[stat] > sheet.scores[best]) best = stat;
  }
  if (best) keys.add(best);
  if (sheet.spell.trained) keys.add(sheet.spell.ability);
  return keys;
}

/**
 * Initiative: DEX, plus half the proficiency bonus for a Jack of All Trades (rounded down), or for a Champion's Remarkable
 * Athlete (rounded up: initiative is a Dexterity check), plus what feats add.
 */
function initiativeBonus(cls: HeroClass, level: number, build: Build | undefined, dex: number, proficiency: number, off: readonly string[]): number {
  const has = (id: string): boolean => classHasFeature(cls.dndClass, level, id, build) && !off.includes(id);
  const jack = has('jack_of_all_trades') ? Math.floor(proficiency / 2) : 0;
  const athlete = has('remarkable_athlete') ? Math.ceil(proficiency / 2) : 0;
  return dex + jack + athlete + featInitiative(cls, level, build);
}

const NONE_OFF: readonly string[] = [];

/** Everything the inventory's character sheet shows, from the player's class and what they wear. */
export function characterSheet(player: Pick<Player, 'equipped' | 'playerStats' | 'health' | 'heroClass' | 'build' | 'featuresOff'>): CharacterSheet {
  const equipped = player.equipped ?? {};
  const cls = heroClass(player.heroClass);
  const level = player.playerStats.level;
  const base = baseScores(cls, level, player.build);
  const scores = abilities(equipped, base);
  const styles = player.build ?? null;
  const off = player.featuresOff ?? NONE_OFF;
  const ac = armorClass(equipped, scores.modifiers, cls, styles);
  const proficiency = proficiencyBonus(level);
  return {
    ...scores,
    heroClass: cls,
    level,
    proficiency,
    baseScores: base,
    armorClass: ac,
    attack: weaponAttack(equipped, scores.modifiers, level, cls, ac.proficient, styles, off),
    offHand: offHandAttack(equipped, scores.modifiers, level, cls, ac.proficient, styles),
    attacks: attacksPerAction(cls, level, off, styles),
    hitPoints: { current: player.health.current, max: player.health.max },
    hitDice: { left: player.playerStats.hitDice, total: level },
    experience: { xp: player.playerStats.exp, next: nextLevelXp(level) },
    battleMaster: player.build?.archetype === 'battle_master',
    maneuverDc: MANEUVER_DC_BASE + proficiency + Math.max(scores.modifiers.strength, scores.modifiers.dexterity),
    initiative: initiativeBonus(cls, level, player.build, scores.modifiers.dexterity, proficiency, off),
    speed: speedIn(ac, scores.scores),
    passivePerception: PASSIVE_BASE + scores.modifiers.wisdom,
    saves: savingThrows(scores.modifiers, cls, proficiency),
    spell: spellcasting(cls, scores.modifiers, proficiency, player.build?.archetype === 'eldritch_knight'),
  };
}
