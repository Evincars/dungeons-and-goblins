import { STAT_NAMES, isStatName } from '../world';
import type { StatName } from '../world';
import { ensure } from '../core/errors';
import { isFiniteNumber, isRecord } from '../core/guards';
import type { ArmorRule } from './ArmorTable';
import feats from '../data/feats.json';

/**
 * The feats a level-up can grant in place of an Ability Score Improvement (the Baldur's Gate 3 list), read from
 * src/data/feats.json. Every one is listed in the level panel; a feat whose requirement the hero misses, or that the game
 * does not play out yet (`worked` false), cannot be taken. What a hero's feats add up to is `FeatEffects`
 * (src/rules/Build.ts gathers it), which the character sheet, combat and movement read.
 */

export const FEAT_IDS = [
  'actor', 'alert', 'athlete', 'charger', 'crossbow_expert', 'defensive_duelist', 'dual_wielder', 'dungeon_delver',
  'durable', 'elemental_adept', 'great_weapon_master', 'heavily_armoured', 'heavy_armour_master', 'lightly_armoured',
  'lucky', 'mage_slayer', 'magic_initiate_bard', 'magic_initiate_cleric', 'magic_initiate_druid', 'magic_initiate_sorcerer',
  'magic_initiate_warlock', 'magic_initiate_wizard', 'martial_adept', 'medium_armour_master', 'mobile', 'moderately_armoured',
  'observant', 'performer', 'polearm_master', 'resilient', 'ritual_caster', 'savage_attacker', 'sentinel', 'sharpshooter',
  'shield_master', 'skilled', 'spell_sniper', 'tavern_brawler', 'tough', 'war_caster', 'weapon_master',
] as const;
export type FeatId = (typeof FEAT_IDS)[number];

export function isFeatId(value: unknown): value is FeatId {
  return FEAT_IDS.some((id) => id === value);
}

type ArmorCategory = ArmorRule['category'];
const ARMOR_CATEGORIES = ['light', 'medium', 'heavy', 'shield'] as const satisfies readonly ArmorCategory[];
const isArmorCategory = (v: unknown): v is ArmorCategory => ARMOR_CATEGORIES.some((c) => c === v);

/** What a hero must have to take a feat: training in an armour, spells, or one of some abilities high enough. */
export type FeatRequirement =
  | { armor: ArmorCategory }
  | { spellcaster: true }
  | { abilityAtLeast: { abilities: readonly StatName[]; score: number } };

export type FeatDef = {
  /** The game plays it out; a feat that is not worked yet is listed but cannot be taken. */
  worked: boolean;
  /** The abilities it raises by 1 (the player picks one when there are several). */
  abilities: readonly StatName[];
  requires: FeatRequirement | null;
  /** Added to initiative rolls. */
  initiative: number;
  /** Tabletop hit points added every level (levels already gained too, when the feat is taken). */
  hitPointsPerLevel: number;
  /** Armour training it gives. */
  armor: readonly ArmorCategory[];
  /** The most DEX medium armour lets count (0: the armour's own cap). */
  mediumArmorDexCap: number;
  /** Damage taken off every enemy weapon blow while wearing heavy armour. */
  heavyArmorReduction: number;
  /** Feet of speed added. */
  speedFeet: number;
  /** Added to passive Perception. */
  passivePerception: number;
  /** Trained in the saving throw of the ability the feat raised. */
  saveProficiency: boolean;
  /** Weapon damage dice are rolled twice and the higher total kept. */
  savageDamage: boolean;
  /** Two-weapon fighting with any one-handed melee weapons (not heavy ones), not only light ones. */
  dualWield: boolean;
  /** Armor Class added while holding a melee weapon in each hand. */
  dualWieldArmorClass: number;
  /** Bare-handed, STR counts twice to hit and to damage. */
  unarmedStrengthTwice: boolean;
  /** A short rest heals every hit point. */
  shortRestFullHeal: boolean;
};

function readNumber(id: FeatId, raw: Record<string, unknown>, key: string): number {
  const value = raw[key] ?? 0;
  ensure(isFiniteNumber(value), `Bad number ${key} in feat ${id}`, { id, key });
  return isFiniteNumber(value) ? value : 0;
}

function readFlag(id: FeatId, raw: Record<string, unknown>, key: string): boolean {
  const value = raw[key] ?? false;
  ensure(typeof value === 'boolean', `Bad flag ${key} in feat ${id}`, { id, key });
  return value === true;
}

function readList<T>(id: FeatId, raw: unknown, key: string, guard: (v: unknown) => v is T): T[] {
  if (raw === undefined) return [];
  ensure(Array.isArray(raw) && raw.every(guard), `Bad ${key} in feat ${id}`, { id, key });
  return Array.isArray(raw) ? raw.filter(guard) : [];
}

function readRequirement(id: FeatId, raw: unknown): FeatRequirement | null {
  if (raw === undefined) return null;
  ensure(isRecord(raw), `Bad requirement in feat ${id}`, { id });
  if (!isRecord(raw)) return null;
  if (isArmorCategory(raw.armor)) return { armor: raw.armor };
  if (raw.spellcaster === true) return { spellcaster: true };
  const at = raw.abilityAtLeast;
  ensure(isRecord(at) && isFiniteNumber(at.score), `Unknown requirement in feat ${id}`, { id });
  if (!isRecord(at)) return null;
  return { abilityAtLeast: { abilities: readList(id, at.abilities, 'requirement', isStatName), score: isFiniteNumber(at.score) ? at.score : 0 } };
}

/** One feat from the file, checked: a missing or misspelt field stops the game with a clear message. */
function readFeat(id: FeatId, raw: unknown): FeatDef {
  ensure(isRecord(raw), `Bad feat ${id}`, { id });
  const r = isRecord(raw) ? raw : {};
  return {
    worked: readFlag(id, r, 'worked'),
    abilities: readList(id, r.abilities, 'abilities', isStatName),
    requires: readRequirement(id, r.requires),
    initiative: readNumber(id, r, 'initiative'),
    hitPointsPerLevel: readNumber(id, r, 'hitPointsPerLevel'),
    armor: readList(id, r.armor, 'armor', isArmorCategory),
    mediumArmorDexCap: readNumber(id, r, 'mediumArmorDexCap'),
    heavyArmorReduction: readNumber(id, r, 'heavyArmorReduction'),
    speedFeet: readNumber(id, r, 'speedFeet'),
    passivePerception: readNumber(id, r, 'passivePerception'),
    saveProficiency: readFlag(id, r, 'saveProficiency'),
    savageDamage: readFlag(id, r, 'savageDamage'),
    dualWield: readFlag(id, r, 'dualWield'),
    dualWieldArmorClass: readNumber(id, r, 'dualWieldArmorClass'),
    unarmedStrengthTwice: readFlag(id, r, 'unarmedStrengthTwice'),
    shortRestFullHeal: readFlag(id, r, 'shortRestFullHeal'),
  };
}

function readAll(): Record<FeatId, FeatDef> {
  const raw: unknown = feats;
  ensure(isRecord(raw), 'Bad feats file', {});
  const table = isRecord(raw) ? raw : {};
  const known = new Set<string>([...FEAT_IDS, '$comment']);
  ensure(Object.keys(table).every((key) => known.has(key)), 'Unknown feat in feats.json', { keys: Object.keys(table) });
  const out: Partial<Record<FeatId, FeatDef>> = {};
  for (const id of FEAT_IDS) out[id] = readFeat(id, table[id]);
  ensure(FEAT_IDS.every((id) => out[id] !== undefined), 'Missing feat', {});
  // parse boundary: every id of FEAT_IDS was filled in just above.
  return out as Record<FeatId, FeatDef>;
}

export const FEATS: Readonly<Record<FeatId, FeatDef>> = readAll();

/** A feat that raises one of several abilities asks the player which; one with a single ability raises that one. */
export function featNeedsAbility(feat: FeatId): boolean {
  return FEATS[feat].abilities.length > 1;
}

/** The ability a feat taken with this choice raises (null: it raises none, or the choice is not one it offers). */
export function featAbility(feat: FeatId, chosen: StatName | undefined): StatName | null {
  const options = FEATS[feat].abilities;
  if (options.length === 1) return options[0];
  return chosen && options.includes(chosen) ? chosen : null;
}

/** Everything a hero's feats add up to (none: `NO_FEATS`). */
export type FeatEffects = {
  initiative: number;
  armor: readonly ArmorCategory[];
  mediumArmorDexCap: number;
  heavyArmorReduction: number;
  speedFeet: number;
  passivePerception: number;
  /** Saving throws the feats made the hero trained in. */
  saves: readonly StatName[];
  savageDamage: boolean;
  dualWield: boolean;
  dualWieldArmorClass: number;
  unarmedStrengthTwice: boolean;
  shortRestFullHeal: boolean;
};

export const NO_FEATS: FeatEffects = {
  initiative: 0, armor: [], mediumArmorDexCap: 0, heavyArmorReduction: 0, speedFeet: 0, passivePerception: 0, saves: [],
  savageDamage: false, dualWield: false, dualWieldArmorClass: 0, unarmedStrengthTwice: false, shortRestFullHeal: false,
};

/** The effects of these feats together (each with the ability it raised, for Resilient's saving throw). */
export function combineFeats(taken: readonly { feat: FeatId; ability: StatName | null }[]): FeatEffects {
  if (!taken.length) return NO_FEATS;
  const armor = new Set<ArmorCategory>();
  const saves = new Set<StatName>();
  const sum = { ...NO_FEATS };
  for (const { feat, ability } of taken) {
    const def = FEATS[feat];
    for (const category of def.armor) armor.add(category);
    if (def.saveProficiency && ability) saves.add(ability);
    sum.initiative += def.initiative;
    sum.mediumArmorDexCap = Math.max(sum.mediumArmorDexCap, def.mediumArmorDexCap);
    sum.heavyArmorReduction += def.heavyArmorReduction;
    sum.speedFeet += def.speedFeet;
    sum.passivePerception += def.passivePerception;
    sum.dualWieldArmorClass += def.dualWieldArmorClass;
    sum.savageDamage ||= def.savageDamage;
    sum.dualWield ||= def.dualWield;
    sum.unarmedStrengthTwice ||= def.unarmedStrengthTwice;
    sum.shortRestFullHeal ||= def.shortRestFullHeal;
  }
  return { ...sum, armor: [...armor], saves: STAT_NAMES.filter((stat) => saves.has(stat)) };
}
