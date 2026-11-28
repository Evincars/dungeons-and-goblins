import { QUICK_ROW, QUICK_SLOTS } from '../world';
import type { Player } from '../world';
import { ensure } from '../core/errors';
import { hasKey, isRecord } from '../core/guards';
import { isDamageType } from './DamageTypes';
import type { DamageType } from './DamageTypes';
import { parseDice } from './Dice';
import type { Dice } from './Dice';
import { heroClass, spellLevelFor } from './Classes';
import { bindingFeatureId, featureBinding, featureOfClass, nthActiveFeature } from './ClassFeatures';
import type { FeatureDef } from './ClassFeatures';
import type { DndClass } from './Classes';
import { KNIGHT_LIST, KNIGHT_SCHOOLS, KNIGHT_SLOT_LEVELS, knightSlotLevel } from './KnightSpells';
import type { Picks } from './Archetypes';
import { SPELLS, SPELL_IDS, TICKS_PER_SECOND, isSpellId } from './Spells';
import { text } from '../core/texts';
import { bindLimit, hasBindLimits } from './Schools';
import { featSpellIds } from './Feats';
import type { SpellDef, SpellId } from './Spells';
import spellbook from '../data/spellbook.json';
import spellList from '../data/spell-list.json';
import type { SpellVariant } from './SpellVariants';

/**
 * The spells of Baldur's Gate 3 (src/data/spell-list.json, made by scripts/bg3-spells.mjs from the BG3 wiki): each one's
 * name, level, school and the classes that learn it, with the D&D rules behind it (src/data/spellbook.json, made by
 * scripts/scrape-spells.mjs from dnd5e.wikidot.com: how far it reaches, what it rolls, its text) where those have it.
 * Only the spells in src/data/spells.json can be cast yet (`castable`); the rest show greyed out, not in the game yet.
 *
 * There are no spell slots. The slot level a spell is cast at is a choice instead: a higher level does more and
 * recovers more slowly. A class opens each spell level at the hero level the tabletop rules give it.
 */

/** The spell levels there are: 0 (cantrips) to 9. */
export const MAX_SPELL_LEVEL = 9;
/** Hero levels at which a cantrip's dice multiply: twice at the first, three times at the second, four at the third. */
export const CANTRIP_TIER_LEVELS = [5, 11, 17] as const;
/** Every spell recovers this long (seconds) unless src/data/spells.json tunes it. */
export const BASE_COOLDOWN_SECONDS = 5;
/** Each level a spell is cast above its own adds this much recovery (seconds). */
export const UPCAST_COOLDOWN_SECONDS = 2.5;
/** A warlock's pact slots stop at this spell level; the higher spells it learns are cast only at their own level. */
const PACT_SLOT_CAP = 5;
/** Feet in one step of the map's scale: 5 feet are 48 pixels (the data's `px` is already worked out). */
export { PX_PER_FIVE_FEET } from './Scale';

export type SpellEffectKind = 'damage' | 'heal';

export type CatalogSpell = {
  id: string;
  name: string;
  /** 0 for a cantrip. */
  level: number;
  school: string;
  /** On the Eldritch Knight's list (src/rules/KnightSpells.ts). */
  knight: boolean;
  /** Cast in the game (src/data/spells.json); the others are listed, greyed out, until they are. */
  castable: boolean;
  /** Kept (its text and rules) but left out of the Skills tab (Friends, Light, Mage Hand, Minor Illusion). */
  hidden: boolean;
  ritual: boolean;
  castingTime: string;
  /** `feet` and `px` are null where the range is not a distance (sight, unlimited). */
  range: { text: string; feet: number | null; px: number | null };
  duration: string;
  concentration: boolean;
  /** The spell's text as the site gives it, and its "At Higher Levels" paragraph. */
  description: string;
  higherLevels: string | null;
  /** What the spell rolls, if it damages or heals. */
  effect: {
    kind: SpellEffectKind;
    dice: Dice;
    /** One type, or the several a caster picks from. */
    damageTypes: readonly DamageType[];
    /** A cantrip's dice at the hero levels where they grow. */
    cantripScaling: readonly { level: number; dice: Dice }[];
    /** Dice added for each level it is cast above its own. */
    perSlotLevel: Dice | null;
  } | null;
  /** The hero level at which each class learns it. */
  classes: Readonly<Partial<Record<string, number>>>;
};

/**
 * A spell on the quick bar: which, the level it is cast at, and (for a spell whose caster picks its kind of damage,
 * Chromatic Orb) the damage type chosen when it was bound (rules/DamageChoice.ts).
 */
export type QuickBinding = { spell: string; level: number; damageType?: DamageType; variant?: SpellVariant };

/** What a square the player emptied (a right click on the quick bar) holds: nothing, not even the class's own spell for it. */
export const UNBOUND = 'unbound';
export const EMPTY_SQUARE: QuickBinding = { spell: UNBOUND, level: 0 };

const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

function readDice(id: string, v: unknown): Dice {
  const parsed = typeof v === 'string' ? parseDice(v) : null;
  ensure(parsed !== null, `Bad dice in spell ${id}`, { id });
  return parsed ?? { count: 1, sides: 4, bonus: 0 };
}

function readEffect(id: string, raw: unknown): CatalogSpell['effect'] {
  if (!isRecord(raw)) return null;
  const types = Array.isArray(raw.damageTypes) ? raw.damageTypes : [];
  ensure(types.every(isDamageType), `Unknown damage type in spell ${id}`, { id });
  const scaling = Array.isArray(raw.cantripScaling) ? raw.cantripScaling : [];
  return {
    kind: raw.kind === 'heal' ? 'heal' : 'damage',
    dice: readDice(id, raw.dice),
    damageTypes: types.filter(isDamageType),
    cantripScaling: scaling.filter(isRecord).map((tier) => ({ level: num(tier.level), dice: readDice(id, tier.dice) })),
    perSlotLevel: typeof raw.perSlotLevel === 'string' ? readDice(id, raw.perSlotLevel) : null,
  };
}

/** The schools of magic, as the lists name them. */
export const SPELL_SCHOOLS = ['Abjuration', 'Conjuration', 'Divination', 'Enchantment', 'Evocation', 'Illusion', 'Necromancy', 'Transmutation'] as const;
export type SpellSchool = (typeof SPELL_SCHOOLS)[number];
const isSchool = (v: unknown): v is SpellSchool => SPELL_SCHOOLS.some((s) => s === v);

/** The hero level at which a class opens a spell's level (a cantrip: level 1), or undefined if it never does. */
function opensAt(cls: string, spellLevel: number): number | undefined {
  if (spellLevel === 0) return 1;
  const kind = hasKey(spellbook.casterKinds, cls) ? spellbook.casterKinds[cls] : null;
  if (!kind || !hasKey(spellbook.unlockLevels, kind)) return undefined;
  const unlocks: readonly (number | null)[] = spellbook.unlockLevels[kind];
  return unlocks[spellLevel - 1] ?? undefined;
}

/** The D&D rules of a spell (src/data/spellbook.json), if they have it. */
function rulesOf(key: unknown): Record<string, unknown> | null {
  if (typeof key !== 'string' || !hasKey(spellbook.spells, key)) return null;
  const raw: unknown = spellbook.spells[key];
  return isRecord(raw) ? raw : null;
}

/** The classes that learn a spell, each with the hero level its spell level opens at (one that never opens it is left out). */
function learners(list: unknown, level: number): Partial<Record<string, number>> {
  const classes: Partial<Record<string, number>> = {};
  for (const cls of Array.isArray(list) ? list : []) {
    const at = typeof cls === 'string' ? opensAt(cls, level) : undefined;
    if (typeof cls === 'string' && at !== undefined) classes[cls] = at;
  }
  return classes;
}

/**
 * One spell of the list, checked (a mistake stops the game with a clear message instead of half-working): its BG3 name,
 * level, school and learners, the rest from its D&D rules where they have it, else its BG3 text alone.
 */
function readSpell(id: string, entry: unknown): CatalogSpell {
  ensure(isRecord(entry) && typeof entry.name === 'string' && Array.isArray(entry.classes), `Bad spell ${id}`, { id });
  const raw = isRecord(entry) ? entry : {};
  ensure(isSchool(raw.school), `Unknown school for spell ${id}`, { id, school: String(raw.school) });
  ensure(raw.img === null || (typeof raw.img === 'string' && raw.img.length > 0), `Bad icon for spell ${id}`, { id });
  const level = num(raw.level);
  const rules = rulesOf(raw.book);
  const range = rules && isRecord(rules.range) ? rules.range : {};
  return {
    id,
    name: str(raw.name),
    level,
    school: str(raw.school),
    knight: raw.knight === true,
    castable: isSpellId(id),
    hidden: raw.hidden === true,
    ritual: rules?.ritual === true,
    castingTime: str(rules?.castingTime) || text('spell.tip.action'),
    range: { text: str(range.text), feet: typeof range.feet === 'number' ? range.feet : null, px: typeof range.px === 'number' ? range.px : null },
    duration: str(rules?.duration),
    concentration: raw.concentration === true,
    description: str(rules?.description) || str(raw.text),
    higherLevels: typeof rules?.higherLevels === 'string' ? rules.higherLevels : null,
    effect: rules ? readEffect(id, rules.effect) : null,
    classes: learners(raw.classes, level),
  };
}

/** Every spell the game knows, by id (src/data/spell-list.json). */
export const CATALOG: Readonly<Record<string, CatalogSpell>> = Object.fromEntries(
  Object.entries(spellList.spells).map(([id, entry]) => [id, readSpell(id, entry)]),
);

/** Each spell's icon under public/ (null: none). */
const ICONS: ReadonlyMap<string, string | null> = new Map(Object.entries(spellList.spells).map(([id, entry]) => {
  const img: unknown = isRecord(entry) ? entry.img : null;
  return [id, typeof img === 'string' ? img : null];
}));

// Every castable spell (src/data/spells.json) must be one the list knows: a stray id stops the game with a clear message.
for (const id of SPELL_IDS) ensure(hasKey(CATALOG, id), `Castable spell ${id} is not in the spell list`, { id });

/** Every spell with an icon, and where it is under public/ (the art loads lazily, see assets/SheetCatalog.ts). */
export function spellIcons(): Array<{ id: string; src: string }> {
  const icons: Array<{ id: string; src: string }> = [];
  for (const [id, src] of ICONS) if (src) icons.push({ id, src: `/${src}` });
  return icons;
}

/** The texture key of a spell's icon, if it has one. */
export function spellIconKey(id: string): string | null {
  return ICONS.get(id) ? `spell_icon_${id}` : null;
}

export function isCatalogSpell(id: unknown): id is string {
  return typeof id === 'string' && hasKey(CATALOG, id);
}

/** A spell list: a class's, or the Eldritch Knight's (the wizard's, as a third of a caster casts it). */
export type SpellList = DndClass | typeof KNIGHT_LIST;

/** The list a hero casts from: an Eldritch Knight's own, else their class's. */
export function spellListOf(cls: DndClass, picks: Picks | undefined): SpellList {
  return cls === 'fighter' && picks?.archetype === 'eldritch_knight' ? KNIGHT_LIST : cls;
}

/** The highest spell level an Eldritch Knight can learn from the wizard list: 4th. */
const KNIGHT_TOP_LEVEL = KNIGHT_SLOT_LEVELS.length;

/** Whether the Eldritch Knight's list holds the spell: one BG3 gives the Eldritch Knight, a cantrip to a 4th-level spell. */
export function knightListed(id: unknown): id is string {
  if (!isCatalogSpell(id)) return false;
  const spell = CATALOG[id];
  return spell.knight && spell.level <= KNIGHT_TOP_LEVEL;
}

/** Whether an Eldritch Knight of this fighter level has slots for the spell (a cantrip needs none) and the list holds it. */
export function knightCanLearn(id: string, heroLevel: number): boolean {
  return knightListed(id) && CATALOG[id].level <= knightSlotLevel(heroLevel);
}

/** A spell outside the schools an Eldritch Knight learns from (abjuration and evocation). */
export function knightOutsideSchools(id: string): boolean {
  return isCatalogSpell(id) && !KNIGHT_SCHOOLS.some((school) => school === CATALOG[id].school);
}

export function isCantripId(id: string): boolean {
  return isCatalogSpell(id) && CATALOG[id].level === 0;
}

/** For each list, its spells by spell level (0-9), by name. Worked out once. */
const BY_CLASS = new Map<string, CatalogSpell[][]>();

function classSpells(list: SpellList): CatalogSpell[][] {
  const cached = BY_CLASS.get(list);
  if (cached) return cached;
  const levels: CatalogSpell[][] = Array.from({ length: MAX_SPELL_LEVEL + 1 }, () => []);
  for (const spell of Object.values(CATALOG)) if (!spell.hidden && learnLevel(list, spell) !== undefined) levels[spell.level].push(spell);
  for (const spells of levels) spells.sort((a, b) => a.name.localeCompare(b.name));
  BY_CLASS.set(list, levels);
  return levels;
}

/** The hero level a list learns a spell at (undefined: it never does). An Eldritch Knight's: when its slots reach the spell's level. */
export function learnLevel(list: SpellList, spell: CatalogSpell): number | undefined {
  if (list !== KNIGHT_LIST) return spell.classes[list];
  if (!knightListed(spell.id)) return undefined;
  return spell.level === 0 ? KNIGHT_SLOT_LEVELS[0] : KNIGHT_SLOT_LEVELS[spell.level - 1];
}

/**
 * The spells the Skills tab shows, by spell level (index 0: cantrips): a wizard sees the whole wizard list, the spells
 * above their level greyed out (`learnLevel` says when each comes); everyone else the spells they have learnt.
 */
export function listedSpells(list: SpellList, heroLevel: number, known?: readonly string[]): CatalogSpell[][] {
  return list === 'wizard' ? classSpells(list) : learntSpells(list, heroLevel, known);
}

/**
 * The spells a hero has learnt by this hero level, by spell level (index 0: cantrips). An Eldritch Knight has only the
 * ones they picked (`known`); anyone else every spell their class opens.
 */
export function learntSpells(list: SpellList, heroLevel: number, known?: readonly string[]): CatalogSpell[][] {
  const mine = (spell: CatalogSpell): boolean => list !== KNIGHT_LIST || !!known?.includes(spell.id);
  return classSpells(list).map((spells) => spells.filter((spell) => mine(spell) && (learnLevel(list, spell) ?? Infinity) <= heroLevel));
}

/** The highest spell level a hero has slots for at this hero level (0: none yet, or not a caster). */
export function highestSpellLevel(cls: SpellList, heroLevel: number): number {
  if (cls === KNIGHT_LIST) return knightSlotLevel(heroLevel);
  const kind = hasKey(spellbook.casterKinds, cls) ? spellbook.casterKinds[cls] : null;
  if (!kind || !hasKey(spellbook.unlockLevels, kind)) return 0;
  const unlocks: readonly (number | null)[] = spellbook.unlockLevels[kind];
  const open = unlocks.filter((at) => at !== null && at <= heroLevel).length;
  return kind === 'pact' ? Math.min(open, PACT_SLOT_CAP) : open;
}

/** Whether the list has any spells at all. */
export function isCaster(cls: SpellList): boolean {
  return classSpells(cls).some((list) => list.length > 0);
}

/**
 * The levels a hero can cast a spell at: a cantrip only at its own; a spell with an "At Higher Levels" effect from
 * its own up to the highest slot the class has; any other spell at its own level alone.
 */
export function castLevels(cls: SpellList, heroLevel: number, spell: CatalogSpell): number[] {
  const top = spell.higherLevels && spell.level > 0 ? highestSpellLevel(cls, heroLevel) : spell.level;
  const levels: number[] = [];
  for (let level = spell.level; level <= Math.max(top, spell.level); level++) levels.push(level);
  return levels;
}

/** Whether a hero of this list and level (who knows these spells, if they pick them) may put this spell on the bar at this cast level. */
export function canBind(cls: SpellList, heroLevel: number, id: unknown, level: unknown, known?: readonly string[]): boolean {
  const feature = typeof id === 'string' ? bindingFeatureId(id) : null;
  if (feature !== null) {
    const def = featureOfClass(cls === KNIGHT_LIST ? 'fighter' : cls, feature);
    return level === 0 && !!def && def.kind === 'active' && def.level <= heroLevel;
  }
  if (!isCatalogSpell(id) || typeof level !== 'number') return false;
  const spell = CATALOG[id];
  // A spell the game does not cast yet is listed, not bound.
  if (!spell.castable) return false;
  if (cls === KNIGHT_LIST && !known?.includes(id)) return false;
  return (learnLevel(cls, spell) ?? Infinity) <= heroLevel && castLevels(cls, heroLevel, spell).includes(level);
}

/** Cantrip dice multiply at 5th, 11th and 17th level: 1, 2, 3 or 4 times the base. */
export function cantripTier(heroLevel: number): number {
  return 1 + CANTRIP_TIER_LEVELS.filter((at) => heroLevel >= at).length;
}

/** Seconds before a spell cast at this level can be cast again. */
export function cooldownSeconds(id: string, castLevel: number): number {
  const own = isCatalogSpell(id) ? CATALOG[id].level : castLevel;
  const base = isSpellId(id) ? SPELLS[id].recoveryTicks / TICKS_PER_SECOND : BASE_COOLDOWN_SECONDS;
  return base + Math.max(0, castLevel - own) * UPCAST_COOLDOWN_SECONDS;
}

/** The dice a spell rolls at this cast level and hero level, with extra dice of another size (if the slot adds some). */
export function spellDice(spell: CatalogSpell, castLevel: number, heroLevel: number): { roll: Dice; extra?: Dice } | null {
  const effect = spell.effect;
  if (!effect) return null;
  const base = effect.dice;
  if (spell.level === 0) return { roll: { ...base, count: base.count * cantripTier(heroLevel) } };
  const steps = Math.max(0, castLevel - spell.level);
  const add = effect.perSlotLevel;
  if (!add || steps === 0) return { roll: base };
  if (add.sides === base.sides) return { roll: { ...base, count: base.count + steps * add.count } };
  return { roll: base, extra: { count: steps * add.count, sides: add.sides, bonus: 0 } };
}

/** What a hero sees of a spell at one cast level: the numbers that change with it. */
export type SpellStats = {
  dice: { roll: Dice; extra?: Dice } | null;
  rangeFeet: number | null;
  rangePx: number | null;
  cooldown: number;
};

export function spellStats(spell: CatalogSpell, castLevel: number, heroLevel: number): SpellStats {
  return { dice: spellDice(spell, castLevel, heroLevel), rangeFeet: spell.range.feet, rangePx: spell.range.px, cooldown: cooldownSeconds(spell.id, castLevel) };
}

/**
 * A castable spell as it goes off at this cast level and hero level: its dice grown, a missile spell's darts
 * counted up, and its recovery stretched. The same spell, cast at its own level by a first-level hero, is unchanged.
 */
export function castDef(def: SpellDef, castLevel: number, heroLevel: number): SpellDef {
  const spell = CATALOG[def.id];
  if (!spell) return def;
  const steps = Math.max(0, castLevel - def.level);
  const tier = def.level === 0 ? cantripTier(heroLevel) : 1;
  const add = spell.effect?.perSlotLevel;
  const grown = add && add.sides === def.damage.sides ? steps * add.count : 0;
  const darts = def.kind === 'missiles' ? steps : 0;
  if (steps === 0 && tier === 1) return def;
  return {
    ...def,
    level: Math.max(def.level, castLevel),
    damage: { ...def.damage, count: def.damage.count * tier + grown },
    count: def.count + darts,
    recoveryTicks: def.recoveryTicks + Math.round(steps * UPCAST_COOLDOWN_SECONDS * TICKS_PER_SECOND),
  };
}

/**
 * The bindings a square holds until the player binds something there, one per spell (keyed by its id) and one per
 * feature (keyed by its def): they are asked for every tick, so each is made once.
 */
const DEFAULT_SPELLS = new Map<string, QuickBinding>();
const DEFAULT_FEATURES = new Map<object, QuickBinding>();

function defaultSpell(id: SpellId): QuickBinding {
  let binding = DEFAULT_SPELLS.get(id);
  if (!binding) DEFAULT_SPELLS.set(id, (binding = { spell: id, level: SPELLS[id].level }));
  return binding;
}

/** Class features are bound at level 0 (see `canBind`). */
function defaultFeature(def: FeatureDef): QuickBinding {
  let binding = DEFAULT_FEATURES.get(def);
  if (!binding) DEFAULT_FEATURES.set(def, (binding = { spell: featureBinding(def.id), level: 0 }));
  return binding;
}

/**
 * The spell on a quick-bar square: what the player bound there, else the class's own: its spells in order along the
 * first row, and the active class features the hero has, in level order, along the second (Shift) row.
 */
export function quickBinding(player: Player, slot: number): QuickBinding | null {
  const bound = player.spellbook?.bound?.[slot];
  if (bound) return bound.spell === UNBOUND ? null : bound;
  const cls = heroClass(player.heroClass);
  if (slot >= QUICK_ROW) {
    const feature = nthActiveFeature(cls.dndClass, player.playerStats.level, player.build ?? null, slot - QUICK_ROW);
    return feature ? defaultFeature(feature) : null;
  }
  const id = cls.spells[slot];
  return id ? defaultSpell(id) : null;
}

/**
 * How many quick-bar squares (both rows) hold a spell bound at this level (0: a cantrip), leaving square `except` out. The
 * class's own spells the hero has not learnt yet (shown dimmed on the bar until their level) are not counted.
 */
export function boundAtLevel(player: Player, castLevel: number, except = -1): number {
  const cls = heroClass(player.heroClass);
  const fromFeats = featSpellIds(player.build?.improvements);
  let count = 0;
  for (let slot = 0; slot < QUICK_SLOTS; slot++) {
    const binding = slot === except ? null : quickBinding(player, slot);
    if (!binding || !isCatalogSpell(binding.spell) || binding.level !== castLevel) continue;
    // A spell a feat taught (Magic Initiate, Spell Sniper) counts against no limit.
    if (fromFeats.includes(binding.spell)) continue;
    if (!isSpellId(binding.spell) || spellLevelFor(cls, binding.spell) <= player.playerStats.level) count++;
  }
  return count;
}

/** Whether one of the hero's feats taught them this spell (Magic Initiate, Spell Sniper). */
export function featTaught(player: Pick<Player, 'build'>, spell: string): boolean {
  return featSpellIds(player.build?.improvements).includes(spell);
}

/**
 * A spell a feat taught the hero may go on the quick bar at its own level (and nowhere else), if the game casts it. It is
 * the hero's whatever their class or level.
 */
export function featSpellBindable(player: Pick<Player, 'build'>, spell: string, level: number): boolean {
  return featTaught(player, spell) && isCatalogSpell(spell) && CATALOG[spell].castable && CATALOG[spell].level === level;
}

/**
 * Whether the hero may put this spell, cast at this level, on square `slot` (whatever is there gives up its place): a
 * wizard keeps only as many cantrips and spells of each level on the bar as their level allows (src/rules/Schools.ts);
 * class features, feats and every other class are not counted.
 */
export function roomToBind(player: Player, spell: string, castLevel: number, slot: number): boolean {
  if (!hasBindLimits(heroClass(player.heroClass)) || !isCatalogSpell(spell) || featTaught(player, spell)) return true;
  return boundAtLevel(player, castLevel, slot) < bindLimit(player.playerStats.level, castLevel);
}

/** Whether the hero could bind this spell somewhere: room is left at its level, or a square holds one of that level it could replace. */
export function roomSomewhere(player: Player, spell: string, castLevel: number): boolean {
  if (!hasBindLimits(heroClass(player.heroClass)) || !isCatalogSpell(spell) || featTaught(player, spell)) return true;
  const used = boundAtLevel(player, castLevel);
  return used < bindLimit(player.playerStats.level, castLevel) || used > 0;
}
