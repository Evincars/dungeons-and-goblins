import { isSpellId } from './Spells';
import type { SpellId } from './Spells';
import { STAT_NAMES, isStatName } from '../world';
import type { StatName } from '../world';
import { ensure } from '../core/errors';
import { hasKey, isRecord } from '../core/guards';
import { isDieSides } from './Dice';
import type { DieSides } from './Dice';
import type { ArmorRule } from './ArmorTable';
import { WEAPON_TABLE, isWeaponBase } from './WeaponTable';
import type { WeaponBase, WeaponRule } from './WeaponTable';
import { CLASS_FEATURES } from './Features';
import type { ClassFeature } from './Features';
import { gainsAt, readProgression } from './Progression';
import type { Gains, Progression } from './Progression';
import { startingHitPoints } from './HitPoints';
import { MAX_LEVEL } from '../game/Progress';
import classes from '../data/classes.json';

/**
 * The heroes a new game offers, read from src/data/classes.json (tune them there): each plays a D&D class, which
 * gives the hit die, what armour and weapons they are trained in, their saving throws, the ability their spells
 * use and what each level hands out (src/rules/Progression.ts). The hero adds their sprite and ability scores.
 */

/**
 * The heroes, each named after their class (a second hero of a class gets a 2). The players name their own
 * characters, so nothing here is a person's name; the sprite sets keep theirs (`character` in classes.json).
 */
export const HERO_CLASSES = ['fighter', 'wizard', 'rogue', 'warlock', 'bard', 'fighter2', 'cleric'] as const;
export type HeroClassId = (typeof HERO_CLASSES)[number];

/** The D&D classes the heroes belong to. */
export const DND_CLASSES = ['fighter', 'wizard', 'rogue', 'warlock', 'bard', 'cleric'] as const;
export type DndClass = (typeof DND_CLASSES)[number];
const isDndClass = (v: unknown): v is DndClass => DND_CLASSES.some((c) => c === v);

export function isHeroClassId(value: unknown): value is HeroClassId {
  return HERO_CLASSES.some((id) => id === value);
}

/** The class a hero is when nothing says otherwise. */
export const DEFAULT_CLASS: HeroClassId = 'fighter';

export type ArmorTraining = ArmorRule['category'];
export type WeaponTraining = WeaponRule['category'];
export const ARMOR_TRAININGS = ['light', 'medium', 'heavy', 'shield'] as const satisfies readonly ArmorTraining[];
export const WEAPON_TRAININGS = ['simple', 'martial'] as const satisfies readonly WeaponTraining[];

export { CLASS_FEATURES };
export type { ClassFeature };

export type HeroClass = {
  id: HeroClassId;
  dndClass: DndClass;
  /** The CharacterDef that draws this hero. */
  character: string;
  hitDie: DieSides;
  /** Hit points at level 1 (the hit die at its highest + CON, see HitPoints.ts). */
  hitPoints: number;
  /** The scores a player who changes nothing keeps (the point buy's start, a human's +1 included); the player's own are in their Build (rules/Build.ts). */
  abilities: Readonly<Record<StatName, number>>;
  armor: readonly ArmorTraining[];
  weapons: readonly WeaponTraining[];
  /** Single weapons trained beyond the kinds in `weapons` (a rogue's rapier, a wizard's dagger). */
  weaponBases: readonly WeaponBase[];
  savingThrows: readonly StatName[];
  /** The ability spells add to hit (null: none, so Intelligence, as anyone untrained). */
  spellcasting: StatName | null;
  /** Every spell the hero learns, in quick-bar order (each from the level its progression gives it). */
  spells: readonly SpellId[];
  /** The features the hero starts with (level 1); later ones come with `gainsAt`. */
  features: readonly ClassFeature[];
  progression: Progression;
};

const isArmorTraining = (v: unknown): v is ArmorTraining => ARMOR_TRAININGS.some((t) => t === v);
const isWeaponTraining = (v: unknown): v is WeaponTraining => WEAPON_TRAININGS.some((t) => t === v);

/** Every entry of a list is one of the known words, or the file is wrong. */
function listOf<T>(id: string, field: string, values: readonly unknown[], valid: (v: unknown) => v is T): T[] {
  ensure(values.every(valid), `Unknown ${field} in class ${id}`, { id, field, values: values.join(', ') });
  return values.filter(valid);
}

type RawClass = (typeof classes.classes)[DndClass];
type RawHero = (typeof classes.heroes)[HeroClassId];

/** One hero from the file with the class they play, checked: a mistake there stops the game with a clear message instead of half-working. */
function readHero(id: HeroClassId, hero: RawHero, raw: RawClass): HeroClass {
  ensure(isDndClass(hero.class), `Unknown D&D class for ${id}`, { id });
  ensure(isDieSides(raw.hitDie), `Bad hit die in class ${hero.class}`, { id });
  const spellcasting: unknown = raw.spellcasting;
  ensure(spellcasting === null || isStatName(spellcasting), `Unknown spellcasting ability for ${id}`, { id });
  const abilities: Record<StatName, number> = hero.abilities;
  ensure(STAT_NAMES.every((stat) => Number.isFinite(abilities[stat])), `Missing ability score for ${id}`, { id });
  const progression = readProgression(id, isRecord(raw.progression) ? raw.progression : null);
  const first = gainsAt(progression, 1);
  const hitDie = isDieSides(raw.hitDie) ? raw.hitDie : 10;
  return {
    id,
    dndClass: isDndClass(hero.class) ? hero.class : 'fighter',
    character: hero.character,
    hitDie,
    hitPoints: startingHitPoints(hitDie, abilities.constitution),
    abilities,
    armor: listOf(id, 'armour', raw.armor, isArmorTraining),
    weapons: listOf(id, 'weapon training', raw.weapons, isWeaponTraining),
    weaponBases: listOf(id, 'weapon', raw.weaponBases, isWeaponBase),
    savingThrows: listOf(id, 'saving throw', raw.savingThrows, isStatName),
    spellcasting: isStatName(spellcasting) ? spellcasting : null,
    spells: gainsAt(progression, MAX_LEVEL).spells,
    features: first.features,
    progression,
  };
}

/** A hero with the class the file names for them. */
function readClassHero(id: HeroClassId, hero: RawHero): HeroClass {
  const name: string = hero.class;
  ensure(hasKey(classes.classes, name), `Unknown D&D class for ${id}`, { id });
  return readHero(id, hero, classes.classes[name]);
}

export const CLASSES = {
  fighter: readClassHero('fighter', classes.heroes.fighter),
  wizard: readClassHero('wizard', classes.heroes.wizard),
  rogue: readClassHero('rogue', classes.heroes.rogue),
  warlock: readClassHero('warlock', classes.heroes.warlock),
  bard: readClassHero('bard', classes.heroes.bard),
  fighter2: readClassHero('fighter2', classes.heroes.fighter2),
  cleric: readClassHero('cleric', classes.heroes.cleric),
} as const satisfies Record<HeroClassId, HeroClass>;

/** A hero's class (the default one for anything without). */
export function heroClass(id: HeroClassId | undefined): HeroClass {
  return CLASSES[id ?? DEFAULT_CLASS];
}

/** What the hero has gained by this level: ability points, features, spells and feats. */
export function heroGains(cls: HeroClass, level: number): Gains {
  return gainsAt(cls.progression, level);
}

export function hasFeature(cls: HeroClass, feature: ClassFeature, level = 1): boolean {
  return heroGains(cls, level).features.includes(feature);
}

/** The level the hero learns a spell at (1 for one the class does not teach). */
export function spellLevelFor(cls: HeroClass, spell: SpellId): number {
  return cls.progression.spellLevel[spell] ?? 1;
}

/** Trained in this kind of armour (no disadvantage on attacks while wearing it). */
export function armorProficient(cls: HeroClass, category: ArmorTraining): boolean {
  return cls.armor.includes(category);
}

/** Trained in this weapon, by its kind or by name (adds the proficiency bonus to hit); everyone can punch. */
export function weaponProficient(cls: HeroClass, base: WeaponBase): boolean {
  return base === 'unarmed' || cls.weapons.includes(WEAPON_TABLE[base].category) || cls.weaponBases.includes(base);
}
