import type { StatName } from '../world';
import { isDieSides } from './Dice';
import type { DieSides } from './Dice';

/**
 * The Battle Master's superiority dice and maneuvers (Player's Handbook). A maneuver is a feature of the Skills tab
 * (src/data/features.json, `needs` its id) put on the quick bar like a spell: using it readies it, and the next
 * fitting blow (or enemy blow, for a reaction) spends a superiority die and does its work (systems/ManeuverSystem.ts).
 * The dice come back with a rest.
 */

export const MANEUVERS = [
  'commanders_strike', 'disarming_attack', 'distracting_strike', 'evasive_footwork', 'feinting_attack', 'goading_attack',
  'lunging_attack', 'maneuvering_attack', 'menacing_attack', 'parry', 'precision_attack', 'pushing_attack', 'rally',
  'riposte', 'sweeping_attack', 'trip_attack',
] as const;
export type ManeuverId = (typeof MANEUVERS)[number];

export function isManeuver(value: unknown): value is ManeuverId {
  return MANEUVERS.some((id) => id === value);
}

/**
 * How a maneuver is played: a `rider` rides on the hero's next weapon blow; a `reaction` answers the next melee blow of
 * an enemy (parry on a hit, riposte on a miss); a `stance` lasts a while (evasive footwork); an `ally` maneuver helps
 * the nearest other hero. `save`: the saving throw the foe makes against the maneuver DC.
 */
export type ManeuverRule = { kind: 'rider' | 'reaction' | 'stance' | 'ally'; save: StatName | null };

export const MANEUVER_RULES = {
  commanders_strike: { kind: 'ally', save: null },
  disarming_attack: { kind: 'rider', save: 'strength' },
  distracting_strike: { kind: 'rider', save: null },
  evasive_footwork: { kind: 'stance', save: null },
  feinting_attack: { kind: 'rider', save: null },
  goading_attack: { kind: 'rider', save: 'wisdom' },
  lunging_attack: { kind: 'rider', save: null },
  maneuvering_attack: { kind: 'rider', save: null },
  menacing_attack: { kind: 'rider', save: 'wisdom' },
  parry: { kind: 'reaction', save: null },
  precision_attack: { kind: 'rider', save: null },
  pushing_attack: { kind: 'rider', save: 'strength' },
  rally: { kind: 'ally', save: null },
  riposte: { kind: 'reaction', save: null },
  sweeping_attack: { kind: 'rider', save: null },
  trip_attack: { kind: 'rider', save: 'strength' },
} as const satisfies Record<ManeuverId, ManeuverRule>;

/** Superiority dice a Battle Master has from this fighter level: 4 at 3, 5 at 7, 6 at 15. */
const DICE_COUNT_TIERS = [{ level: 15, count: 6 }, { level: 7, count: 5 }, { level: 3, count: 4 }] as const;
/** ...and their size: d8, d10 at 10 (Improved Combat Superiority), d12 at 18. */
const DICE_SIDES_TIERS = [{ level: 18, sides: 12 }, { level: 10, sides: 10 }, { level: 3, sides: 8 }] as const;
/** Maneuvers known: 3 at 3, 5 at 7, 7 at 10, 9 at 15; the levels at which more are learnt. */
const KNOWN_TIERS = [{ level: 15, known: 9 }, { level: 10, known: 7 }, { level: 7, known: 5 }, { level: 3, known: 3 }] as const;

export function superiorityDice(level: number): number {
  for (const tier of DICE_COUNT_TIERS) if (level >= tier.level) return tier.count;
  return 0;
}

export function superioritySides(level: number): DieSides {
  for (const tier of DICE_SIDES_TIERS) if (level >= tier.level && isDieSides(tier.sides)) return tier.sides;
  return 8;
}

export function maneuversKnown(level: number): number {
  for (const tier of KNOWN_TIERS) if (level >= tier.level) return tier.known;
  return 0;
}

/** The hero levels that teach new maneuvers. */
export const MANEUVER_LEVELS: readonly number[] = KNOWN_TIERS.map((tier) => tier.level).reverse();

/** A maneuver's saving throw DC: 8 + proficiency + STR or DEX, whichever is better. */
export const MANEUVER_DC_BASE = 8;

/** Ticks a readied maneuver waits for its blow (10 s) before it lapses unspent. */
export const MANEUVER_READY_TICKS = 600;
/** Ticks a foe stays tripped (prone), frightened, goaded or distracted (a few turns' worth). */
export const PRONE_TICKS = 180;
export const FRIGHTENED_TICKS = 360;
export const GOADED_TICKS = 360;
export const DISTRACTED_TICKS = 360;
/** Evasive Footwork's added Armor Class lasts this long (10 s) while the hero keeps moving. */
export const EVASIVE_TICKS = 600;
/** A pushed foe is shoved this hard: knockback fades by a fifth a tick, so it carries about 5 times as far (15 feet = 144 px). */
export const PUSH_BUMP = 28;
/** A lunge reaches 5 feet further (5 feet are 48 px, as in src/rules/Spellbook.ts). */
export const LUNGE_REACH = 48;
/** A sweeping attack hits a second foe within 5 feet of the first. */
export const SWEEP_REACH = 48;
/** Eldritch Strike's mark on a foe lasts this long (6 s: until the end of the hero's next turn). */
export const ELDRITCH_TICKS = 360;
/** An ally hero within this many pixels (30 feet) can be commanded or rallied. */
export const ALLY_REACH = 288;
