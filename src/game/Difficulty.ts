import type { MobType } from '../world';

/**
 * How hard a level is: the deeper the party goes the more enemies there are and the more of them are of the tougher kinds,
 * and the more heroes play the more enemies there are and the harder they are to kill (in direct proportion: each hero
 * more adds the same again). Set by the level as it is built (scenes/InGameScene.ts), read where enemies are made.
 */

export type Difficulty = {
  /** How deep the level lies (1: the first). */
  depth: number;
  /** Heroes in the party (the host and every guest). */
  players: number;
  /** The heroes' level (their mean, rounded): the level enemy spellcasters cast at. */
  partyLevel: number;
};

export const difficulty: Difficulty = { depth: 1, players: 1, partyLevel: 1 };

export function setDifficulty(next: Difficulty): void {
  difficulty.depth = Math.max(1, next.depth);
  difficulty.players = Math.max(1, next.players);
  difficulty.partyLevel = Math.max(1, next.partyLevel);
}

/** Each level deeper adds this share to the number of enemies and to their hit points. */
const COUNT_PER_DEPTH = 0.12;
const HEALTH_PER_DEPTH = 0.1;
/** Each hero more adds this share to the number of enemies and to their hit points. */
const COUNT_PER_PLAYER = 0.6;
const HEALTH_PER_PLAYER = 0.4;
/** The first levels hold a few more enemies than their depth alone would, but only of the easy kinds. */
const EARLY_CROWD = 1.25;
const EARLY_DEPTHS = 2;

/** How many enemies a room holds against its plain count. */
export function enemyCountScale(d: Difficulty = difficulty): number {
  const early = d.depth <= EARLY_DEPTHS ? EARLY_CROWD : 1;
  return early * (1 + COUNT_PER_DEPTH * (d.depth - 1)) * (1 + COUNT_PER_PLAYER * (d.players - 1));
}

/** How many hit points an enemy has against its stat block's. */
export function enemyHealthScale(d: Difficulty = difficulty): number {
  return (1 + HEALTH_PER_DEPTH * (d.depth - 1)) * (1 + HEALTH_PER_PLAYER * (d.players - 1));
}

/**
 * How tough each kind is: easy ones fill the first levels and thin out deeper; middling ones grow common; the hard ones
 * (a troll, the evil wizard) turn up only from the third level, more and more often.
 */
const TIERS = {
  goblin: 'easy', goblin_grunt: 'easy', goblin_rogue: 'easy', skeleton: 'easy', shade: 'easy',
  orc: 'middling', goblin_warrior: 'middling', grick: 'middling', ghost_wizard: 'middling',
  troll: 'hard', evil_wizard: 'hard',
} as const satisfies Record<MobType, 'easy' | 'middling' | 'hard'>;
const EASY_START = 1.4;
const EASY_FALL = 0.15;
const EASY_FLOOR = 0.35;
const MIDDLING_START = 0.35;
const MIDDLING_RISE = 0.3;
const MIDDLING_CAP = 2;
const HARD_FROM = 3;
const HARD_RISE = 0.25;
const HARD_CAP = 1.5;

/** How much more (or less) often a kind turns up at a depth than its weight in its mix says. */
export function depthWeight(type: MobType, depth: number = difficulty.depth): number {
  const steps = depth - 1;
  switch (TIERS[type]) {
    case 'easy': return Math.max(EASY_FLOOR, EASY_START - EASY_FALL * steps);
    case 'middling': return Math.min(MIDDLING_CAP, MIDDLING_START + MIDDLING_RISE * steps);
    default: return depth < HARD_FROM ? 0 : Math.min(HARD_CAP, HARD_RISE * (depth - HARD_FROM + 1));
  }
}
