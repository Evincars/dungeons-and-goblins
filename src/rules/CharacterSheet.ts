import type { EquipSlot, InventoryItem, Player, StatName } from '../world';
import { abilities, proficiencyBonus } from './Abilities';
import type { Abilities } from './Abilities';
import { UNARMORED_AC } from './ArmorTable';
import type { ArmorBase, ArmorRule } from './ArmorTable';
import { WEAPON_TABLE } from './WeaponTable';
import type { WeaponBase, WeaponRule } from './WeaponTable';
import { plus } from './Dice';
import type { Dice } from './Dice';
import { armorRule, isShield, magicBonus, weaponRule } from './Equipment';

/**
 * What the rules make of a character's gear and abilities: Armor Class, the damage and attack bonus of the
 * weapon in hand, and hit points, worked out the way the tabletop game does.
 */

type Equipped = Partial<Record<EquipSlot, InventoryItem>>;

export type ArmorClass = {
  total: number;
  /** The body armour worn and its table entry (null with none on). */
  armor: { item: InventoryItem; base: ArmorBase } | null;
  /** The AC before DEX: 10 with no armour, else the armour's own. */
  base: number;
  /** The part of the DEX modifier that counts (heavy armour: none; medium: at most +2). */
  dex: number;
  /** The armour's magic bonus. */
  magic: number;
  /** What the shield adds, its magic included (0 with none). */
  shield: number;
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

/** Armor Class: 10 + DEX bare, or the armour's AC (+ the DEX it allows), plus magic, plus a shield. */
export function armorClass(equipped: Equipped, dexModifier: number): ArmorClass {
  const worn = armorRule(equipped.armor);
  const armor = worn && equipped.armor && worn.rule.category !== 'shield' ? { item: equipped.armor, base: worn.base } : null;
  const rule = armor && worn ? worn.rule : null;
  const base = rule ? rule.ac : UNARMORED_AC;
  const dex = countedDex(rule, dexModifier);
  const magic = magicBonus(armor?.item);
  const shieldItem = shieldOf(equipped);
  const shield = shieldItem ? (armorRule(shieldItem)?.rule.ac ?? 0) + magicBonus(shieldItem) : 0;
  return { total: base + dex + magic + shield, armor, base, dex, magic, shield };
}

export type WeaponAttack = {
  /** The weapon in hand (null when fighting bare-handed) and the table entry it fights as. */
  item: InventoryItem | null;
  base: WeaponBase;
  rule: WeaponRule;
  /** The ability that drives it, and that ability's modifier. */
  ability: Extract<StatName, 'strength' | 'dexterity'>;
  abilityModifier: number;
  magic: number;
  proficiency: number;
  /** A versatile weapon held in both hands (the other hand empty) deals its larger dice. */
  twoHanded: boolean;
  /** The damage roll, every bonus added. */
  damage: Dice;
  /** What is added to the d20 to hit. */
  attackBonus: number;
};

/** The weapon a character fights with: the primary hand's, else a weapon in the second hand. */
function weaponInHand(equipped: Equipped): InventoryItem | null {
  if (weaponRule(equipped.primary)) return equipped.primary ?? null;
  return weaponRule(equipped.secondary) ? equipped.secondary ?? null : null;
}

/** Melee weapons use STR, ranged ones DEX; finesse weapons whichever is better. */
function attackAbility(rule: WeaponRule, modifiers: Record<StatName, number>): WeaponAttack['ability'] {
  if (rule.properties.includes('finesse')) return modifiers.dexterity > modifiers.strength ? 'dexterity' : 'strength';
  return rule.range === 'ranged' ? 'dexterity' : 'strength';
}

/** The other hand is free (nothing in it), so a versatile weapon can be held in both. */
function otherHandFree(equipped: Equipped, item: InventoryItem | null): boolean {
  const other = equipped.primary === item ? equipped.secondary : equipped.primary;
  return !other;
}

/**
 * The attack of the weapon in hand: its dice + the ability modifier + its magic bonus; to hit, d20 +
 * proficiency + the same modifier + magic. Bare-handed it is a punch: 1 + STR.
 */
export function weaponAttack(equipped: Equipped, modifiers: Record<StatName, number>, level: number): WeaponAttack {
  const item = weaponInHand(equipped);
  const found = weaponRule(item ?? undefined);
  const base: WeaponBase = found?.base ?? 'unarmed';
  const rule: WeaponRule = found?.rule ?? WEAPON_TABLE.unarmed;
  const ability = attackAbility(rule, modifiers);
  const abilityModifier = modifiers[ability];
  const magic = magicBonus(item ?? undefined);
  const proficiency = proficiencyBonus(level);
  const twoHanded = !!rule.versatile && !!item && otherHandFree(equipped, item);
  const dice = twoHanded && rule.versatile ? rule.versatile : rule.damage;
  return {
    item, base, rule, ability, abilityModifier, magic, proficiency, twoHanded,
    damage: plus(dice, abilityModifier + magic),
    attackBonus: proficiency + abilityModifier + magic,
  };
}

export type CharacterSheet = Abilities & {
  armorClass: ArmorClass;
  attack: WeaponAttack;
  hitPoints: { current: number; max: number };
};

/** Everything the inventory's character sheet shows, from what the player wears. */
export function characterSheet(player: Pick<Player, 'equipped' | 'playerStats' | 'health'>): CharacterSheet {
  const equipped = player.equipped ?? {};
  const scores = abilities(equipped);
  return {
    ...scores,
    armorClass: armorClass(equipped, scores.modifiers.dexterity),
    attack: weaponAttack(equipped, scores.modifiers, player.playerStats.level),
    hitPoints: { current: player.health.current, max: player.health.max },
  };
}
