import { ensure } from '../core/errors';
import { isFiniteNumber, isRecord } from '../core/guards';
import feats from '../data/feats.json';

/** The feats a level-up can grant in place of an Ability Score Improvement, read from src/data/feats.json. */

export const FEAT_IDS = ['alert', 'tough'] as const;
export type FeatId = (typeof FEAT_IDS)[number];

export function isFeatId(value: unknown): value is FeatId {
  return FEAT_IDS.some((id) => id === value);
}

export type FeatDef = {
  /** Added to initiative rolls. */
  initiative: number;
  /** Tabletop hit points added every level (levels already gained too, when the feat is taken). */
  hitPointsPerLevel: number;
};

/** One feat from the file, checked: a missing or misspelt field stops the game with a clear message. */
function readFeat(id: FeatId, raw: unknown): FeatDef {
  ensure(isRecord(raw), `Bad feat ${id}`, { id });
  const initiative = raw.initiative ?? 0;
  const hitPointsPerLevel = raw.hitPointsPerLevel ?? 0;
  ensure(isFiniteNumber(initiative) && isFiniteNumber(hitPointsPerLevel), `Bad number in feat ${id}`, { id });
  return {
    initiative: isFiniteNumber(initiative) ? initiative : 0,
    hitPointsPerLevel: isFiniteNumber(hitPointsPerLevel) ? hitPointsPerLevel : 0,
  };
}

export const FEATS = {
  alert: readFeat('alert', feats.alert),
  tough: readFeat('tough', feats.tough),
} as const satisfies Record<FeatId, FeatDef>;
