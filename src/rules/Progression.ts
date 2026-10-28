import { isStatName } from '../world';
import type { StatName } from '../world';
import { ensure } from '../core/errors';
import { isFiniteNumber, isRecord } from '../core/guards';
import { MAX_LEVEL } from '../game/Progress';
import { isClassFeature } from './Features';
import type { ClassFeature } from './Features';
import { isFeatId } from './Feats';
import type { FeatId } from './Feats';
import { isSpellId } from './Spells';
import type { SpellId } from './Spells';

/**
 * What each level of a class hands out, read from the class's `progression` in src/data/classes.json: features,
 * spells, fixed ability points, feats, and the choices the player makes themselves (a fighting style, an Ability
 * Score Improvement or a feat; src/rules/Build.ts keeps what was picked). The rewards of every level are folded
 * into one `Gains` per level when the file is read, so asking what a hero has at a level never allocates.
 */

/** No ability score goes above this (gear may add on top). */
export const ABILITY_CAP = 20;

export type Reward =
  | { feature: ClassFeature }
  | { spell: SpellId }
  | { asi: true }
  | { choice: 'fighting_style' | 'archetype' }
  | { ability: StatName; amount: number }
  | { feat: FeatId };

/** Everything a hero has been handed by a level, without the choices they made. */
export type Gains = {
  /** Fixed points added to the base ability scores. */
  abilityBonus: Readonly<Record<StatName, number>>;
  features: readonly ClassFeature[];
  /** Spells learnt so far, in the order they were learnt (the quick bar's order). */
  spells: readonly SpellId[];
  /** Feats the class itself grants. */
  feats: readonly FeatId[];
  /** Ability Score Improvements (or feats in their place) on offer so far. */
  improvements: number;
  /** Fighting styles on offer so far (a Champion's second comes at level 10). */
  fightingStyles: number;
  /** Whether a Martial Archetype is on offer. */
  archetype: boolean;
};

export type Progression = {
  /** What each level hands out, level 1 first (the level log lists it). */
  rewards: readonly (readonly Reward[])[];
  /** Gains after level 1 (index 0) up to MAX_LEVEL. */
  gains: readonly Gains[];
  /** The level each spell is learnt at. */
  spellLevel: Readonly<Partial<Record<SpellId, number>>>;
};

/** One reward, checked against the lists of known features, spells, abilities and feats. */
function readReward(where: string, raw: unknown): Reward {
  ensure(isRecord(raw), `Bad reward in ${where}`, { where });
  if (isClassFeature(raw.feature)) return { feature: raw.feature };
  if (isSpellId(raw.spell)) return { spell: raw.spell };
  if (isFeatId(raw.feat)) return { feat: raw.feat };
  if (raw.asi === true) return { asi: true };
  if (raw.choice === 'fighting_style' || raw.choice === 'archetype') return { choice: raw.choice };
  ensure(isStatName(raw.ability) && isFiniteNumber(raw.amount), `Unknown reward in ${where}`, { where });
  return { ability: isStatName(raw.ability) ? raw.ability : 'strength', amount: isFiniteNumber(raw.amount) ? raw.amount : 0 };
}

/** The rewards of each level, 1 to MAX_LEVEL; a level the file leaves out gives none. */
function readLevels(id: string, raw: unknown): Reward[][] {
  ensure(isRecord(raw), `Missing progression in class ${id}`, { id });
  ensure(Object.keys(raw).every((key) => Number(key) >= 1 && Number(key) <= MAX_LEVEL), `A level outside 1-${MAX_LEVEL} in ${id}`, { id });
  const levels: Reward[][] = [];
  for (let level = 1; level <= MAX_LEVEL; level++) {
    const list = raw[String(level)] ?? [];
    ensure(Array.isArray(list), `Bad rewards for level ${level} of ${id}`, { id, level });
    levels.push(Array.isArray(list) ? list.map((reward) => readReward(`${id} level ${level}`, reward)) : []);
  }
  return levels;
}

type Running = {
  bonus: Record<StatName, number>;
  features: ClassFeature[];
  spells: SpellId[];
  feats: FeatId[];
  improvements: number;
  fightingStyles: number;
  archetype: boolean;
};

/** Folds one reward into what the hero has so far. */
function apply(reward: Reward, now: Running, level: number, learnt: Partial<Record<SpellId, number>>): void {
  if ('feature' in reward) now.features.push(reward.feature);
  else if ('feat' in reward) now.feats.push(reward.feat);
  else if ('asi' in reward) now.improvements++;
  else if ('choice' in reward) {
    if (reward.choice === 'archetype') now.archetype = true;
    else now.fightingStyles++;
  }
  else if ('ability' in reward) now.bonus[reward.ability] += reward.amount;
  else if (!now.spells.includes(reward.spell)) {
    now.spells.push(reward.spell);
    learnt[reward.spell] = level;
  }
}

function zeroBonus(): Record<StatName, number> {
  return { strength: 0, dexterity: 0, constitution: 0, intelligence: 0, wisdom: 0, charisma: 0 } satisfies Record<StatName, number>;
}

/** A class's progression: the gains at every level. */
export function readProgression(id: string, raw: unknown): Progression {
  const levels = readLevels(id, raw);
  const now: Running = { bonus: zeroBonus(), features: [], spells: [], feats: [], improvements: 0, fightingStyles: 0, archetype: false };
  const learnt: Partial<Record<SpellId, number>> = {};
  const gains: Gains[] = [];
  levels.forEach((rewards, index) => {
    for (const reward of rewards) apply(reward, now, index + 1, learnt);
    gains.push({
      abilityBonus: { ...now.bonus }, features: [...now.features], spells: [...now.spells], feats: [...now.feats],
      improvements: now.improvements, fightingStyles: now.fightingStyles, archetype: now.archetype,
    });
  });
  return { rewards: levels, gains, spellLevel: learnt };
}

/** What a hero has at this level (levels past the table's ends count as its first or last). */
export function gainsAt(progression: Progression, level: number): Gains {
  return progression.gains[Math.min(MAX_LEVEL, Math.max(1, level)) - 1];
}
