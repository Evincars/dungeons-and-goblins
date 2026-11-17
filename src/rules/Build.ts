import { STAT_NAMES, isStatName } from '../world';
import type { StatName } from '../world';
import { isFiniteNumber, isRecord } from '../core/guards';
import type { ArmorTraining, HeroClass } from './Classes';
import { FEATS, FEAT_IDS, combineFeats, featAbility, isFeatId } from './Feats';
import type { FeatEffects, FeatId, FeatRequirement } from './Feats';
import { DEFAULT_FIGHTING_STYLE, isFightingStyle } from './FightingStyles';
import type { FightingStyleId } from './FightingStyles';
import { PLAYABLE_ARCHETYPES, isArchetype } from './Archetypes';
import type { ArchetypeId } from './Archetypes';
import { MANEUVER_LEVELS, isManeuver, maneuversKnown } from './Maneuvers';
import { KNIGHT_PICK_LEVELS, freeSchoolPicks, knightCantripsKnown, knightSpellsKnown } from './KnightSpells';
import { isCantripId, knightCanLearn, knightListed, knightOutsideSchools } from './Spellbook';
import { HUMAN_BONUS, validPointBuy } from './PointBuy';
import { ABILITY_CAP, gainsAt } from './Progression';

/**
 * What a player decided for their hero, on top of what the class hands out by level (src/rules/Progression.ts):
 * the bought ability scores and the fighting style, both open to change only until the hero leaves the first
 * safe room (`locked`), a Champion's second fighting style, and the Ability Score Improvements or feats taken at the levels that offer them.
 */

/**
 * One Ability Score Improvement (two points, +2 in one ability or +1 in two) or a feat in its place (with the ability it
 * raises by 1, for a feat that lets the player pick one).
 */
export type Improvement = { stats: Partial<Record<StatName, number>> } | { feat: FeatId; ability?: StatName };

export type Build = {
  /** The bought scores, 8 to 15 (a human's +1 comes on top, see `baseScores`). */
  scores: Record<StatName, number>;
  /** The hero has left the first safe room: scores and style can no longer change. */
  locked: boolean;
  fightingStyle?: FightingStyleId;
  /** The second style a Champion takes at level 10 (different from the first); final once taken. */
  extraStyle?: FightingStyleId;
  /** The Martial Archetype taken at level 3; final once taken. */
  archetype?: ArchetypeId;
  /** A Battle Master's maneuvers known (ids from src/rules/Maneuvers.ts), in the order they were learnt. */
  maneuvers?: string[];
  /** An Eldritch Knight's cantrips and spells known (wizard spells, ids from the spell catalog), in the order they were learnt. */
  spells?: string[];
  /** One entry per Improvement taken, in the order the levels offered them. */
  improvements: Improvement[];
};

/** An Ability Score Improvement is this many points. */
const IMPROVEMENT_POINTS = 2;

/** A fresh build: the class's own scores (the standard array placed for it), nothing chosen. */
export function newBuild(cls: HeroClass): Build {
  const scores = { ...cls.abilities };
  for (const stat of STAT_NAMES) scores[stat] -= HUMAN_BONUS;
  return { scores, locked: false, improvements: [] };
}

/** What the Improvements put into one ability: their points, and the 1 of each feat that raised it. */
function improvementPoints(build: Build | undefined, stat: StatName): number {
  let points = 0;
  for (const improvement of build?.improvements ?? []) points += improvementShare(improvement, stat);
  return points;
}

function improvementShare(improvement: Improvement, stat: StatName): number {
  if ('stats' in improvement) return improvement.stats[stat] ?? 0;
  return featAbility(improvement.feat, improvement.ability) === stat ? 1 : 0;
}

/** The six ability scores before gear: bought, plus the human's point, fixed class bonuses and the Improvements taken. */
export function baseScores(cls: HeroClass, level: number, build: Build | undefined): Record<StatName, number> {
  const bonus = gainsAt(cls.progression, level).abilityBonus;
  const bought = build?.scores;
  const score = (stat: StatName): number => (bought ? bought[stat] + HUMAN_BONUS : cls.abilities[stat]) + bonus[stat] + improvementPoints(build, stat);
  return {
    strength: score('strength'), dexterity: score('dexterity'), constitution: score('constitution'),
    intelligence: score('intelligence'), wisdom: score('wisdom'), charisma: score('charisma'),
  } satisfies Record<StatName, number>;
}

/** Whether the hero has a feat, from their class or from an Improvement they swapped for it. */
export function hasFeat(cls: HeroClass, level: number, build: Build | undefined, feat: FeatId): boolean {
  if (gainsAt(cls.progression, level).feats.includes(feat)) return true;
  return !!build?.improvements.some((improvement) => 'feat' in improvement && improvement.feat === feat);
}

/** Every feat the hero has, from their class and from their Improvements, with the ability each raised. */
function featsTaken(cls: HeroClass, level: number, build: Build | undefined): { feat: FeatId; ability: StatName | null }[] {
  const taken = gainsAt(cls.progression, level).feats.map((feat) => ({ feat, ability: featAbility(feat, undefined) }));
  for (const improvement of build?.improvements ?? []) {
    if ('feat' in improvement) taken.push({ feat: improvement.feat, ability: featAbility(improvement.feat, improvement.ability) });
  }
  return taken;
}

/** What the hero's feats add up to (src/rules/Feats.ts); `on`: the toggle feats switched on. */
export function featEffects(cls: HeroClass, level: number, build: Build | undefined, on: readonly string[] = []): FeatEffects {
  return combineFeats(featsTaken(cls, level, build), on);
}

/** The Passive Feats the hero has (Great Weapon Master, Defensive Duellist…), in the order of the feat list: the Skills tab lists them. */
export function passiveFeats(cls: HeroClass, level: number, build: Build | undefined): FeatId[] {
  return FEAT_IDS.filter((feat) => FEATS[feat].worked && FEATS[feat].passive !== null && hasFeat(cls, level, build, feat));
}

/** Initiative bonus from feats. */
export function featInitiative(cls: HeroClass, level: number, build: Build | undefined): number {
  return featEffects(cls, level, build).initiative;
}

/** Trained in this kind of armour: by the class, or by a feat. */
export function armorTrained(cls: HeroClass, effects: FeatEffects, category: ArmorTraining): boolean {
  return cls.armor.includes(category) || effects.armor.includes(category);
}

/** The hero casts spells: a caster class, or an Eldritch Knight. */
export function isSpellcaster(cls: HeroClass, build: Build | undefined): boolean {
  return cls.spellcasting !== null || build?.archetype === 'eldritch_knight';
}

/** Whether the hero meets what a feat asks for (a feat that asks for nothing is always met). */
export function meetsRequirement(cls: HeroClass, level: number, build: Build | undefined, requires: FeatRequirement | null): boolean {
  if (!requires) return true;
  if ('armor' in requires) return armorTrained(cls, featEffects(cls, level, build), requires.armor);
  if ('spellcaster' in requires) return isSpellcaster(cls, build);
  const scores = baseScores(cls, level, build);
  return requires.abilityAtLeast.abilities.some((stat) => scores[stat] >= requires.abilityAtLeast.score);
}

/** A feat the hero may take now: the game plays it out, they meet its requirement and have not taken it yet. */
export function featOpen(cls: HeroClass, level: number, build: Build | undefined, feat: FeatId): boolean {
  return FEATS[feat].worked && meetsRequirement(cls, level, build, FEATS[feat].requires) && !hasFeat(cls, level, build, feat);
}

/** Improvements on offer at this level that are still to be taken. */
export function improvementsPending(cls: HeroClass, level: number, build: Build | undefined): number {
  return gainsAt(cls.progression, level).improvements - (build?.improvements.length ?? 0);
}

/** Which Improvement (0 for the first) the class hands out at this level; -1 when the level offers none. */
export function improvementIndexAt(cls: HeroClass, level: number): number {
  if (!cls.progression.rewards[level - 1]?.some((reward) => 'asi' in reward)) return -1;
  return gainsAt(cls.progression, level).improvements - 1;
}

/** This level has something for the player to decide: the starting scores (level 1, until saved) or an Improvement not taken yet. */
export function levelHasChoice(cls: HeroClass, level: number, build: Build | undefined): boolean {
  if (!build) return false;
  if (level === 1 && !build.locked) return true;
  if (archetypeLevel(cls, level) && !build.archetype && PLAYABLE_ARCHETYPES.length > 1) return true;
  if (picksPending(build, level)) return true;
  if (extraStyleLevel(cls, level)) return build.archetype === 'champion' && !build.extraStyle;
  const index = improvementIndexAt(cls, level);
  return index >= 0 && index >= build.improvements.length;
}

/** The class offers a fighting style by this level. */
export function fightingStyleOffered(cls: HeroClass, level: number): boolean {
  return gainsAt(cls.progression, level).fightingStyles >= 1;
}

/** The class has offered a second fighting style by this level. */
export function extraStyleOffered(cls: HeroClass, level: number): boolean {
  return gainsAt(cls.progression, level).fightingStyles >= 2;
}

/** Whether this very level is the one that offers the second fighting style. */
export function extraStyleLevel(cls: HeroClass, level: number): boolean {
  const rewards = cls.progression.rewards[level - 1];
  return !!rewards?.some((reward) => 'choice' in reward) && extraStyleOffered(cls, level) && !extraStyleOffered(cls, level - 1);
}

/** The class offers a Martial Archetype by this level, and whether this very level is the one that does. */
export function archetypeOffered(cls: HeroClass, level: number): boolean {
  return gainsAt(cls.progression, level).archetype;
}

export function archetypeLevel(cls: HeroClass, level: number): boolean {
  return archetypeOffered(cls, level) && !archetypeOffered(cls, level - 1) && !!cls.progression.rewards[level - 1]?.some((reward) => 'choice' in reward);
}

/** Maneuvers a Battle Master still has to choose at this level (0 for anyone else). */
export function maneuversNeeded(build: Build | undefined, level: number): number {
  if (build?.archetype !== 'battle_master') return 0;
  return Math.max(0, maneuversKnown(level) - (build.maneuvers?.length ?? 0));
}

/** The cantrips and spells an Eldritch Knight still has to choose at this level (zeros for anyone else). */
export function knightNeeded(build: Build | undefined, level: number): { cantrips: number; spells: number } {
  if (build?.archetype !== 'eldritch_knight') return { cantrips: 0, spells: 0 };
  const known = build.spells ?? [];
  const cantrips = known.filter(isCantripId).length;
  return {
    cantrips: Math.max(0, knightCantripsKnown(level) - cantrips),
    spells: Math.max(0, knightSpellsKnown(level) - (known.length - cantrips)),
  };
}

/** This level teaches the hero's archetype something new that they have not chosen yet. */
export function picksPending(build: Build | undefined, level: number): boolean {
  if (build?.archetype === 'battle_master') return MANEUVER_LEVELS.includes(level) && maneuversNeeded(build, level) > 0;
  const need = knightNeeded(build, level);
  return KNIGHT_PICK_LEVELS.includes(level) && (need.cantrips > 0 || need.spells > 0);
}

/**
 * The highest level whose tab the hero may read: every level up to the first one with a choice still to make (that
 * one included). A level that asks for nothing is shown together with the next, and the levels after an open choice
 * wait until it is made.
 */
export function visibleLevel(cls: HeroClass, level: number, build: Build | undefined): number {
  for (let at = 1; at < level; at++) if (levelHasChoice(cls, at, build)) return at;
  return level;
}

/** Whether any level up to this one has something to decide. */
export function hasChoices(cls: HeroClass, level: number, build: Build | undefined): boolean {
  for (let at = 1; at <= level; at++) if (levelHasChoice(cls, at, build)) return true;
  return false;
}

// ── Changes (each returns whether it was allowed) ────────────────────────────

/** Buying the six scores: only at level 1 and before leaving the first safe room, within the point budget. */
export function setScores(build: Build, level: number, scores: Readonly<Record<StatName, number>>): boolean {
  if (build.locked || level !== 1 || !validPointBuy(scores)) return false;
  for (const stat of STAT_NAMES) build.scores[stat] = scores[stat];
  return true;
}

/** Picking (or changing) the fighting style, while the first safe room is still the hero's. */
export function chooseFightingStyle(cls: HeroClass, build: Build, level: number, style: FightingStyleId): boolean {
  if (build.locked || !fightingStyleOffered(cls, level)) return false;
  build.fightingStyle = style;
  return true;
}

/** The second style, taken at the level that offers it: any style but the first, once and for good. */
export function takeExtraStyle(cls: HeroClass, build: Build, level: number, style: FightingStyleId): boolean {
  if (!extraStyleOffered(cls, level) || build.archetype !== 'champion' || !build.fightingStyle || build.extraStyle || style === build.fightingStyle) return false;
  build.extraStyle = style;
  return true;
}

/** The Martial Archetype, taken at the level that offers it: final once chosen, and only one the game offers for now. */
export function takeArchetype(cls: HeroClass, build: Build, level: number, archetype: ArchetypeId): boolean {
  if (!archetypeOffered(cls, level) || build.archetype || !PLAYABLE_ARCHETYPES.includes(archetype)) return false;
  build.archetype = archetype;
  return true;
}

/**
 * With a single archetype on offer there is nothing to choose: a hero who has reached the level that offers it is given
 * it at once. Returns the archetype given (null: none was due).
 */
export function grantArchetype(cls: HeroClass, build: Build, level: number): ArchetypeId | null {
  if (PLAYABLE_ARCHETYPES.length !== 1 || build.archetype || !archetypeOffered(cls, level)) return null;
  build.archetype = PLAYABLE_ARCHETYPES[0];
  return build.archetype;
}

/** What a hero learns at a level that teaches something new: maneuvers, or an Eldritch Knight's cantrips and spells. */
export type LevelPicks = { maneuvers?: string[]; spells?: string[] };

function distinctNew(ids: readonly string[], known: readonly string[] | undefined): boolean {
  return new Set(ids).size === ids.length && ids.every((id) => !known?.includes(id));
}

/** The maneuvers chosen are exactly the ones still owed at this level, all known to the game, none known yet. */
function maneuversFit(build: Build, level: number, ids: readonly string[]): boolean {
  return build.archetype === 'battle_master' && MANEUVER_LEVELS.includes(level) && ids.length === maneuversNeeded(build, level)
    && ids.every(isManeuver) && distinctNew(ids, build.maneuvers);
}

/** The cantrips and spells chosen are exactly the ones owed at this level, castable from the wizard list at the slots they have. */
function knightFits(build: Build, level: number, ids: readonly string[]): boolean {
  const need = knightNeeded(build, level);
  const fresh = ids.filter((id) => !isCantripId(id));
  if (build.archetype !== 'eldritch_knight' || !KNIGHT_PICK_LEVELS.includes(level) || !distinctNew(ids, build.spells)) return false;
  if (ids.length - fresh.length !== need.cantrips || fresh.length !== need.spells) return false;
  if (!ids.every((id) => knightCanLearn(id, level))) return false;
  const outside = [...(build.spells ?? []), ...fresh].filter((id) => !isCantripId(id) && knightOutsideSchools(id)).length;
  return outside <= freeSchoolPicks(level);
}

/** The player picks what a level teaches (the maneuvers, or the spells, still owed at it); it is final. */
export function takePicks(cls: HeroClass, build: Build, level: number, picks: LevelPicks): boolean {
  if (!archetypeOffered(cls, level)) return false;
  if (picks.maneuvers?.length) {
    if (!maneuversFit(build, level, picks.maneuvers)) return false;
    build.maneuvers = [...(build.maneuvers ?? []), ...picks.maneuvers];
    return true;
  }
  if (!picks.spells?.length || !knightFits(build, level, picks.spells)) return false;
  build.spells = [...(build.spells ?? []), ...picks.spells];
  return true;
}

/** The player saves their choices before leaving the room; a class with a fighting style needs one picked first. */
export function saveBuild(cls: HeroClass, build: Build, level: number): boolean {
  if (build.locked || (fightingStyleOffered(cls, level) && !build.fightingStyle)) return false;
  lockBuild(cls, build, level);
  return true;
}

/** Leaving the first safe room: what was decided is final, and a hero who never picked a style gets the default. */
export function lockBuild(cls: HeroClass, build: Build, level: number): void {
  if (build.locked) return;
  build.locked = true;
  if (fightingStyleOffered(cls, level) && !build.fightingStyle) build.fightingStyle = DEFAULT_FIGHTING_STYLE;
}

/** A feat the hero may take, with an ability it offers (when it raises one) that is still below the cap. */
function featFits(cls: HeroClass, level: number, build: Build, feat: FeatId, ability: StatName | undefined): boolean {
  if (!isFeatId(feat) || !featOpen(cls, level, build, feat)) return false;
  if (!FEATS[feat].abilities.length) return ability === undefined;
  const raised = featAbility(feat, ability);
  return raised !== null && baseScores(cls, level, build)[raised] < ABILITY_CAP;
}

/** The improvement is two points that keep every score within the cap, or a feat the hero may take. */
function improvementFits(cls: HeroClass, level: number, build: Build, improvement: Improvement): boolean {
  if ('feat' in improvement) return featFits(cls, level, build, improvement.feat, improvement.ability);
  const scores = baseScores(cls, level, build);
  const entries = Object.entries(improvement.stats);
  const points = entries.reduce((sum, [, amount]) => sum + amount, 0);
  const inRange = entries.every(([stat, amount]) => isStatName(stat) && Number.isInteger(amount) && amount > 0 && scores[stat] + amount <= ABILITY_CAP);
  return points === IMPROVEMENT_POINTS && inRange;
}

/** Taking an Improvement (or a feat) that a level offered; it is final. */
export function takeImprovement(cls: HeroClass, build: Build, level: number, improvement: Improvement): boolean {
  if (improvementsPending(cls, level, build) <= 0 || !improvementFits(cls, level, build, improvement)) return false;
  build.improvements.push(improvement);
  return true;
}

// ── Checking one that came from outside ──────────────────────────────────────

export function validImprovement(value: unknown): value is Improvement {
  if (!isRecord(value)) return false;
  if ('feat' in value) return isFeatId(value.feat) && (value.ability === undefined || isStatName(value.ability));
  const stats = value.stats;
  if (!isRecord(stats)) return false;
  const entries = Object.entries(stats);
  return entries.length > 0 && entries.length <= STAT_NAMES.length
    && entries.every(([stat, amount]) => isStatName(stat) && isFiniteNumber(amount) && Number.isInteger(amount) && amount > 0 && amount <= IMPROVEMENT_POINTS)
    && entries.reduce((sum, [, amount]) => sum + Number(amount), 0) === IMPROVEMENT_POINTS;
}

/** The six scores are whole numbers a point buy allows. */
export function validScores(value: unknown): value is Record<StatName, number> {
  return isRecord(value) && STAT_NAMES.every((stat) => isFiniteNumber(value[stat])) && validPointBuy({
    strength: Number(value.strength), dexterity: Number(value.dexterity), constitution: Number(value.constitution),
    intelligence: Number(value.intelligence), wisdom: Number(value.wisdom), charisma: Number(value.charisma),
  });
}

/** A build as it arrives from a host: sane scores, a known style, well-formed Improvements. */
export function validBuild(value: unknown): value is Build {
  if (!isRecord(value) || !validScores(value.scores) || typeof value.locked !== 'boolean') return false;
  if (value.fightingStyle !== undefined && !isFightingStyle(value.fightingStyle)) return false;
  if (value.extraStyle !== undefined && (!isFightingStyle(value.extraStyle) || value.extraStyle === value.fightingStyle)) return false;
  if (value.archetype !== undefined && !isArchetype(value.archetype)) return false;
  if (value.maneuvers !== undefined && !(Array.isArray(value.maneuvers) && value.maneuvers.length <= MAX_PICKS && value.maneuvers.every(isManeuver))) return false;
  if (value.spells !== undefined && !(Array.isArray(value.spells) && value.spells.length <= MAX_PICKS && value.spells.every(knightListed))) return false;
  return Array.isArray(value.improvements) && value.improvements.length <= MAX_IMPROVEMENTS && value.improvements.every(validImprovement);
}

/** More maneuvers or spells than a hero ever knows. */
const MAX_PICKS = 24;

/** More than any class offers (one a few levels, from level 4 up). */
const MAX_IMPROVEMENTS = 8;
