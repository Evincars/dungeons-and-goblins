import { STAT_NAMES } from '../world';
import type { StatName } from '../world';

/**
 * Ability scores by point buy, as in the SRD: every score starts at 8 and is bought up to 15 from a budget of
 * 27 points (each step costs more than the last). A hero's racial bonus comes on top of what was bought.
 */

export const POINT_BUY_BUDGET = 27;
export const POINT_BUY_MIN = 8;
export const POINT_BUY_MAX = 15;
/** Every hero is a human: +1 to all six abilities, added to the bought scores. */
export const HUMAN_BONUS = 1;

/** What a score costs from 8: 8 is free, 13 costs 5, and 14 and 15 cost 2 more each (the SRD table). */
const COSTS = [0, 1, 2, 3, 4, 5, 7, 9] as const;

type Scores = Readonly<Record<StatName, number>>;

/** The points a score costs, or null when it is outside what can be bought. */
export function scoreCost(score: number): number | null {
  if (!Number.isInteger(score) || score < POINT_BUY_MIN || score > POINT_BUY_MAX) return null;
  return COSTS[score - POINT_BUY_MIN];
}

/** The points all six scores cost together; scores that cannot be bought make it too many. */
export function pointsSpent(scores: Scores): number {
  let total = 0;
  for (const stat of STAT_NAMES) total += scoreCost(scores[stat]) ?? POINT_BUY_BUDGET + 1;
  return total;
}

export function pointsLeft(scores: Scores): number {
  return POINT_BUY_BUDGET - pointsSpent(scores);
}

/** Every score can be bought and the six together stay within the budget. */
export function validPointBuy(scores: Scores): boolean {
  return STAT_NAMES.every((stat) => scoreCost(scores[stat]) !== null) && pointsSpent(scores) <= POINT_BUY_BUDGET;
}

/** Whether one more point can go into this score with the points left. */
export function canRaise(scores: Scores, stat: StatName): boolean {
  const next = scoreCost(scores[stat] + 1);
  const now = scoreCost(scores[stat]);
  return next !== null && now !== null && next - now <= pointsLeft(scores);
}

export function canLower(scores: Scores, stat: StatName): boolean {
  return scores[stat] > POINT_BUY_MIN;
}
