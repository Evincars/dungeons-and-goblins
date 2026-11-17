import type { EquipSlot, InventoryItem, SummonKind, TransmuterStone } from '../world';
import { armorRule, isShield, weaponRule } from './Equipment';
import type { WeaponBase } from './WeaponTable';
import type { HeroClass } from './Classes';
import type { Dice } from './Dice';
import { schoolOf } from './Archetypes';
import type { Picks } from './Archetypes';

/**
 * The Wizard's rules as Baldur's Gate 3 plays them, up to level 12: how many cantrips and spells of each level a wizard may
 * keep on the quick bar, Arcane Recovery's charges, and the numbers of the schools' features (src/data/features.json says
 * what each does; src/systems/SchoolSystem.ts and src/systems/SummonSystem.ts play them out).
 */

/**
 * What a wizard may keep bound to the quick bar at each wizard level (index 0: level 1): cantrips, then spells bound at
 * levels 1 to 6. The table of the wizard's spell slots, read as bindings.
 */
const WIZARD_BINDS = [
  [3, 2, 0, 0, 0, 0, 0],
  [3, 3, 0, 0, 0, 0, 0],
  [3, 4, 2, 0, 0, 0, 0],
  [4, 4, 3, 0, 0, 0, 0],
  [4, 4, 3, 2, 0, 0, 0],
  [4, 4, 3, 3, 0, 0, 0],
  [4, 4, 3, 3, 1, 0, 0],
  [4, 4, 3, 3, 2, 0, 0],
  [4, 4, 3, 3, 3, 1, 0],
  [5, 4, 3, 3, 3, 2, 0],
  [5, 4, 3, 3, 3, 2, 1],
  [5, 4, 3, 3, 3, 2, 1],
] as const satisfies readonly (readonly number[])[];

/** The highest spell level the bind table counts (a wizard of level 12 casts 6th-level spells at most). */
export const BIND_TOP_LEVEL = WIZARD_BINDS[0].length - 1;

/** Whether this class is held to the bind table (only the Wizard, for now). */
export function hasBindLimits(cls: HeroClass): boolean {
  return cls.dndClass === 'wizard';
}

/** How many spells bound at `spellLevel` (0: cantrips) a wizard of this level may keep on the quick bar. */
export function bindLimit(heroLevel: number, spellLevel: number): number {
  const row = WIZARD_BINDS[Math.min(WIZARD_BINDS.length, Math.max(1, heroLevel)) - 1];
  return spellLevel >= 0 && spellLevel < row.length ? row[spellLevel] : 0;
}

/** Arcane Recovery's charges at a wizard level: (level + 1) / 2, rounded down (1 at level 1, 6 at level 11). */
export function arcaneRecoveryCharges(heroLevel: number): number {
  return Math.floor((Math.max(1, heroLevel) + 1) / 2);
}

/** Arcane Recovery readies the spells bound at this level and below, never higher ones. */
export const ARCANE_RECOVERY_TOP_LEVEL = 5;

// ── Bladesinging ──────────────────────────────────────────────────────────────

/** The blades a Bladesinger is trained in (Training in War and Song) and sings with: Bladesong is impeded by any other in the main hand. */
export const BLADESONG_WEAPONS: readonly WeaponBase[] = ['dagger', 'sickle', 'shortsword', 'rapier', 'scimitar', 'longsword'];
/** Feet Bladesong (or a Transmuter's Stone of speed) adds to the walking pace. */
export const SCHOOL_SPEED_FEET = 10;

type Equipped = Partial<Record<EquipSlot, InventoryItem>>;

/** Bladesong does nothing in medium or heavy armour, with a shield, or with a main-hand weapon that is not a Bladesinger's blade. */
export function bladesongImpeded(equipped: Equipped): boolean {
  const armour = armorRule(equipped.armor)?.rule.category;
  if (armour === 'medium' || armour === 'heavy' || isShield(equipped.secondary)) return true;
  const weapon = weaponRule(equipped.primary);
  return !!weapon && !BLADESONG_WEAPONS.includes(weapon.base);
}

/** The class as a Bladesinger is trained: light armour and the Bladesinger's blades on top of the wizard's own. */
export function trainedClass(cls: HeroClass, picks: Picks | null | undefined): HeroClass {
  if (schoolOf(picks) !== 'bladesinging') return cls;
  return {
    ...cls,
    armor: cls.armor.includes('light') ? cls.armor : [...cls.armor, 'light'],
    weaponBases: [...cls.weaponBases, ...BLADESONG_WEAPONS.filter((base) => !cls.weaponBases.includes(base))],
  };
}

/** The bonuses a hero's school gives right now: Bladesong and a Transmuter's Stone. */
export type SchoolBonuses = {
  /** Added to Armor Class (Bladesong: the proficiency bonus). */
  armorClass: number;
  /** Feet added to the walking pace. */
  speedFeet: number;
  /** Added to Constitution saving throws (Bladesong: the proficiency bonus). */
  constitutionSave: number;
  /** Trained in Constitution saving throws (a Transmuter's Stone). */
  constitutionTrained: boolean;
};

export const NO_SCHOOL_BONUSES: SchoolBonuses = { armorClass: 0, speedFeet: 0, constitutionSave: 0, constitutionTrained: false };

/** What a singing Bladesinger (unimpeded) and the stone carried add, at this proficiency bonus. */
export function schoolBonuses(singing: boolean, stone: TransmuterStone | '' | undefined, proficiency: number): SchoolBonuses {
  if (!singing && !stone) return NO_SCHOOL_BONUSES;
  return {
    armorClass: singing ? proficiency : 0,
    speedFeet: (singing ? SCHOOL_SPEED_FEET : 0) + (stone === 'speed' ? SCHOOL_SPEED_FEET : 0),
    constitutionSave: singing ? proficiency : 0,
    constitutionTrained: stone === 'constitution',
  };
}

// ── Necromancy ────────────────────────────────────────────────────────────────

/**
 * The undead Animate Dead raises: Armor Class, hit points, to hit, and damage (the necromancer's proficiency bonus is added
 * on top). Undead Thralls adds the wizard level to the hit points.
 */
export const UNDEAD_STATS = {
  zombie: { ac: 8, health: 22, attackBonus: 3, damage: { count: 1, sides: 6, bonus: 1 } },
  skeleton: { ac: 13, health: 13, attackBonus: 4, damage: { count: 1, sides: 6, bonus: 2 } },
} as const satisfies Record<SummonKind, { ac: number; health: number; attackBonus: number; damage: Dice }>;
