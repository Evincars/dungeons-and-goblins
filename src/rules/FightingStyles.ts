/**
 * The Fighter's fighting styles (SRD), chosen once at level 1 in the starting safe room (src/rules/Build.ts); a
 * Champion takes a second, different one at level 10 (Additional Fighting Style).
 * archery: +2 to attack rolls with ranged weapons.
 * defense: +1 Armor Class while wearing armour.
 * dueling: +2 damage with a melee weapon held in one hand and no other weapon in the other.
 * great_weapon_fighting: a 1 or 2 on a damage die of a melee weapon held in two hands is rolled again, and the
 *   new roll stands (the weapon must be two-handed or versatile).
 * protection: while carrying a shield, an enemy's attack on an ally beside you is rolled with disadvantage; a
 *   passive that needs a few seconds to recover (systems/ProtectionSystem.ts).
 * two_weapon_fighting: the off-hand blow of a light weapon in each hand adds the ability modifier to its damage
 *   (without the style it deals the dice and the magic bonus alone).
 */
export const FIGHTING_STYLES = ['archery', 'defense', 'dueling', 'great_weapon_fighting', 'protection', 'two_weapon_fighting'] as const;
export type FightingStyleId = (typeof FIGHTING_STYLES)[number];

export function isFightingStyle(value: unknown): value is FightingStyleId {
  return FIGHTING_STYLES.some((style) => style === value);
}

/** The style a hero who never chose gets on leaving the safe room. */
export const DEFAULT_FIGHTING_STYLE: FightingStyleId = 'defense';

/** The styles a hero took: the one of level 1, and a second one at the level a Champion is given it. */
export type Styles = { readonly fightingStyle?: FightingStyleId; readonly extraStyle?: FightingStyleId };

/** Whether a hero took this style, as either of their two picks (a build is a `Styles`; so is `undefined`: no style). */
export function hasStyle(styles: Styles | null | undefined, style: FightingStyleId): boolean {
  return styles?.fightingStyle === style || styles?.extraStyle === style;
}

export const ARCHERY_ATTACK_BONUS = 2;
export const DEFENSE_ARMOR_CLASS = 1;
export const DUELING_DAMAGE_BONUS = 2;
/** Great Weapon Fighting rolls a damage die again when it shows this or less. */
export const GREAT_WEAPON_REROLL_BELOW = 2;

/** Protection reaches allies within 5 feet; a tile is 5 feet (32 px), counted from centre to centre with room for a diagonal. */
export const PROTECTION_REACH = 48;
/** Ticks Protection needs before it protects again (5 s). */
export const PROTECTION_COOLDOWN_TICKS = 300;
