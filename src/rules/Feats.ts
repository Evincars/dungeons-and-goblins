import { STAT_NAMES, isStatName } from '../world';
import type { StatName } from '../world';
import { ensure } from '../core/errors';
import { isFiniteNumber, isRecord } from '../core/guards';
import type { ArmorRule } from './ArmorTable';
import { isDamageType } from './DamageTypes';
import type { DamageType } from './DamageTypes';
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

/**
 * What a Passive Feat is: one the player switches on and off from the quick bar, one that works by itself, or one used from
 * the quick bar that then recovers (Charger).
 */
export const FEAT_PASSIVES = ['toggle', 'auto', 'active'] as const;
export type FeatPassive = (typeof FEAT_PASSIVES)[number];
const isFeatPassive = (v: unknown): v is FeatPassive => FEAT_PASSIVES.some((p) => p === v);

/** The weapons a power attack (Great Weapon Master, Sharpshooter) works with. */
export const POWER_ATTACKS = ['heavy_melee', 'ranged'] as const;
export type PowerAttack = (typeof POWER_ATTACKS)[number];
const isPowerAttack = (v: unknown): v is PowerAttack => POWER_ATTACKS.some((p) => p === v);

/** A power attack trades this much to hit for POWER_ATTACK_DAMAGE more damage. */
export const POWER_ATTACK_HIT = -5;
export const POWER_ATTACK_DAMAGE = 10;
/** Ticks Defensive Duellist needs before it turns another blow aside (30 s; a rest makes it ready). */
export const DUELIST_COOLDOWN_TICKS = 1800;

/** The word that makes a quick-bar binding a feat to switch on and off (`feat:great_weapon_master`). */
export const FEAT_PREFIX = 'feat:';

/** The feat a quick-bar binding names, if it names one. */
export function bindingFeatId(spell: string): FeatId | null {
  if (!spell.startsWith(FEAT_PREFIX)) return null;
  const id = spell.slice(FEAT_PREFIX.length);
  return isFeatId(id) ? id : null;
}

export const featBinding = (id: FeatId): string => `${FEAT_PREFIX}${id}`;

/** Armour that takes training: clothes (a robe) need none. */
type ArmorCategory = Exclude<ArmorRule['category'], 'clothes'>;
const ARMOR_CATEGORIES = ['light', 'medium', 'heavy', 'shield'] as const satisfies readonly ArmorCategory[];
const isArmorCategory = (v: unknown): v is ArmorCategory => ARMOR_CATEGORIES.some((c) => c === v);

/** The classes whose spell lists a feat may teach from (Magic Initiate: Bard…). */
export const SPELL_LIST_CLASSES = ['bard', 'cleric', 'druid', 'sorcerer', 'warlock', 'wizard'] as const;
export type SpellListClass = (typeof SPELL_LIST_CLASSES)[number];
const isSpellListClass = (v: unknown): v is SpellListClass => SPELL_LIST_CLASSES.some((c) => c === v);

/**
 * What the player picks with a feat, in a box that opens once it is chosen (ui/FeatPicks.ts): cantrips and 1st-level spells
 * (from one class's list, or any damaging cantrip; cast with `ability`, or the hero's own spellcasting ability when null),
 * weapons to be trained in, or the damage type a feat masters.
 */
export type FeatPicks =
  | { kind: 'spells'; cantrips: number; spells: number; from: SpellListClass | null; damaging: boolean; ability: StatName | null }
  | { kind: 'weapons'; count: number }
  | { kind: 'element'; options: readonly DamageType[] };

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
  /** A Passive Feat: switched on and off from the quick bar, or working by itself (null: neither). */
  passive: FeatPassive | null;
  /** While switched on: -5 to hit, +10 damage with this kind of weapon (when proficient). */
  powerAttack: PowerAttack | null;
  /** A critical hit or a kill with a melee weapon adds an attack to the next swing (Great Weapon Master). */
  bonusAttack: boolean;
  /** Defensive Duellist's reaction. */
  duelist: boolean;
  /** A kill with a ranged weapon adds a shot to the next volley (Sharpshooter). */
  rangedBonusAttack: boolean;
  /** Alert: rolls initiative even against a foe nobody sees coming. */
  alert: boolean;
  /** Never falls into a pit: the hero leaps over it, or springs back from its edge (Athlete, Mobile). */
  pitLeap: boolean;
  /** Charger: used from the quick bar, a rush at the foe nearest the aim and a weapon attack. */
  charge: boolean;
  /** Seconds an `active` Passive Feat takes to recover once used. */
  cooldown: number;
  /** Percentage points added to the chance a piece of gear found in a chest is magical (Dungeon Delver). */
  magicFind: number;
  /** Advantage on saving throws against spells cast by a foe within melee reach (Mage Slayer). */
  mageSlayer: boolean;
  /** With a glaive, halberd, pike, quarterstaff or spear, every swing adds a blow with the butt end (Polearm Master). */
  polearm: boolean;
  /** Added to Dexterity saving throws while carrying a shield (Shield Master). */
  shieldSaves: number;
  /** What the player picks with the feat (null: nothing). */
  picks: FeatPicks | null;
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
    passive: readChoice(id, r.passive, 'passive', isFeatPassive),
    powerAttack: readChoice(id, r.powerAttack, 'powerAttack', isPowerAttack),
    bonusAttack: readFlag(id, r, 'bonusAttack'),
    duelist: readFlag(id, r, 'duelist'),
    rangedBonusAttack: readFlag(id, r, 'rangedBonusAttack'),
    alert: readFlag(id, r, 'alert'),
    pitLeap: readFlag(id, r, 'pitLeap'),
    charge: readFlag(id, r, 'charge'),
    cooldown: readNumber(id, r, 'cooldown'),
    magicFind: readNumber(id, r, 'magicFind'),
    mageSlayer: readFlag(id, r, 'mageSlayer'),
    polearm: readFlag(id, r, 'polearm'),
    shieldSaves: readNumber(id, r, 'shieldSaves'),
    picks: readPicks(id, r.picks),
  };
}

const whole = (v: unknown): v is number => isFiniteNumber(v) && Number.isInteger(v) && v >= 0;

/** What the feat lets the player pick, checked: cantrips and spells, weapons, or a damage type of a list. */
function readPicks(id: FeatId, raw: unknown): FeatPicks | null {
  if (raw === undefined) return null;
  ensure(isRecord(raw), `Bad picks in feat ${id}`, { id });
  if (!isRecord(raw)) return null;
  if (raw.weapons !== undefined) {
    ensure(whole(raw.weapons), `Bad weapon picks in feat ${id}`, { id });
    return { kind: 'weapons', count: whole(raw.weapons) ? raw.weapons : 0 };
  }
  if (raw.element !== undefined) return { kind: 'element', options: readList(id, raw.element, 'element', isDamageType) };
  const { cantrips = 0, spells = 0, from = null, ability = null, damaging = false } = raw;
  ensure(whole(cantrips) && whole(spells) && (from === null || isSpellListClass(from)), `Bad spell picks in feat ${id}`, { id });
  ensure((ability === null || isStatName(ability)) && typeof damaging === 'boolean', `Bad spell picks in feat ${id}`, { id });
  return {
    kind: 'spells', cantrips: whole(cantrips) ? cantrips : 0, spells: whole(spells) ? spells : 0,
    from: isSpellListClass(from) ? from : null, damaging: damaging === true, ability: isStatName(ability) ? ability : null,
  };
}

function readChoice<T>(id: FeatId, raw: unknown, key: string, guard: (v: unknown) => v is T): T | null {
  if (raw === undefined) return null;
  ensure(guard(raw), `Bad ${key} in feat ${id}`, { id, key });
  return guard(raw) ? raw : null;
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

/**
 * The feats a level-up offers: only those the game plays out (`worked`). The rest stay in src/data/feats.json, unseen in
 * the level panel until they are.
 */
export const OFFERED_FEATS: readonly FeatId[] = FEAT_IDS.filter((feat) => FEATS[feat].worked);

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

/** A feat a hero has taken: the ability it raised, and what the player picked with it. */
export type TakenFeat = { feat: FeatId; ability: StatName | null; picks?: readonly string[] };

/** A spell a feat taught: its id and the ability it is cast with (null: the hero's own spellcasting ability). */
export type FeatSpell = { spell: string; ability: StatName | null };

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
  /** The power attacks switched on, and the feat each comes from (for the tooltip). */
  powerAttacks: readonly { kind: PowerAttack; feat: FeatId }[];
  bonusAttack: boolean;
  duelist: boolean;
  rangedBonusAttack: boolean;
  alert: boolean;
  pitLeap: boolean;
  magicFind: number;
  mageSlayer: boolean;
  polearm: boolean;
  shieldSaves: number;
  /** Damage types an Elemental Adept masters: their dice never show a 1. */
  elements: readonly DamageType[];
  /** Weapons a Weapon Master is trained in (weapon base ids). */
  weapons: readonly string[];
  /** Cantrips and spells feats taught (Magic Initiate, Spell Sniper). */
  spells: readonly FeatSpell[];
};

export const NO_FEATS: FeatEffects = {
  initiative: 0, armor: [], mediumArmorDexCap: 0, heavyArmorReduction: 0, speedFeet: 0, passivePerception: 0, saves: [],
  savageDamage: false, dualWield: false, dualWieldArmorClass: 0, unarmedStrengthTwice: false, shortRestFullHeal: false,
  powerAttacks: [], bonusAttack: false, duelist: false, rangedBonusAttack: false, alert: false, pitLeap: false, magicFind: 0,
  mageSlayer: false, polearm: false, shieldSaves: 0, elements: [], weapons: [], spells: [],
};

/** The picks a taken feat adds to the hero's effects: the damage types, weapons or spells it gave. */
function addPicks(def: FeatDef, picks: readonly string[], into: { elements: Set<DamageType>; weapons: Set<string>; spells: FeatSpell[] }): void {
  const kind = def.picks?.kind;
  if (kind === 'element') for (const pick of picks.filter(isDamageType)) into.elements.add(pick);
  if (kind === 'weapons') for (const pick of picks) into.weapons.add(pick);
  if (def.picks?.kind !== 'spells') return;
  const ability = def.picks.ability;
  for (const spell of picks) into.spells.push({ spell, ability });
}

/**
 * The effects of these feats together (each with the ability it raised, for Resilient's saving throw). `on`: the toggle
 * feats the hero has switched on (a power attack counts only then).
 */
export function combineFeats(taken: readonly TakenFeat[], on: readonly string[] = []): FeatEffects {
  if (!taken.length) return NO_FEATS;
  const powerAttacks: { kind: PowerAttack; feat: FeatId }[] = [];
  const armor = new Set<ArmorCategory>();
  const saves = new Set<StatName>();
  const spells: FeatSpell[] = [];
  const picked = { elements: new Set<DamageType>(), weapons: new Set<string>(), spells };
  const sum = { ...NO_FEATS };
  for (const { feat, ability, picks } of taken) {
    const def = FEATS[feat];
    addPicks(def, picks ?? [], picked);
    addFlags(sum, def);
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
    sum.bonusAttack ||= def.bonusAttack;
    sum.duelist ||= def.duelist;
    if (def.powerAttack && on.includes(feat)) powerAttacks.push({ kind: def.powerAttack, feat });
  }
  return {
    ...sum, armor: [...armor], saves: STAT_NAMES.filter((stat) => saves.has(stat)), powerAttacks,
    elements: [...picked.elements], weapons: [...picked.weapons], spells: picked.spells,
  };
}

/** The newer feats' effects added in (kept apart so `combineFeats` stays short). */
function addFlags(sum: { -readonly [K in keyof FeatEffects]: FeatEffects[K] }, def: FeatDef): void {
  sum.rangedBonusAttack ||= def.rangedBonusAttack;
  sum.alert ||= def.alert;
  sum.pitLeap ||= def.pitLeap;
  sum.mageSlayer ||= def.mageSlayer;
  sum.polearm ||= def.polearm;
  sum.magicFind += def.magicFind;
  sum.shieldSaves += def.shieldSaves;
}

/** The spells the feats among these Improvements taught (their ids), for the Skills tab and the quick bar. */
export function featSpellIds(improvements: readonly ({ feat: FeatId; picks?: readonly string[] } | object)[] | undefined): string[] {
  const ids: string[] = [];
  for (const improvement of improvements ?? []) {
    if (!('feat' in improvement) || FEATS[improvement.feat].picks?.kind !== 'spells') continue;
    ids.push(...(improvement.picks ?? []));
  }
  return ids;
}
