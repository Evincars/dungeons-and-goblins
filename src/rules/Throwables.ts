import { isStatName } from '../world';
import type { StatName } from '../world';
import { ensure } from '../core/errors';
import { isRecord } from '../core/guards';
import { DAMAGE_TYPES } from './DamageTypes';
import type { DamageType } from './DamageTypes';
import { parseDice } from './Dice';
import type { Dice } from './Dice';
import { feetToPx } from './Scale';
import { TICKS_PER_SECOND } from './Spells';
import throwables from '../data/throwables.json';

/**
 * The flasks enemies throw (src/data/throwables.json): Alchemist's Fire, which splashes fire, sets whoever fails their save
 * alight and leaves the floor burning; and the Grease Bottle, which leaves slick grease where feet slip (and fire takes).
 */

export const THROWABLE_IDS = ['alchemists_fire', 'grease_bottle'] as const;
export type ThrowableId = (typeof THROWABLE_IDS)[number];

export function isThrowableId(value: unknown): value is ThrowableId {
  return THROWABLE_IDS.some((id) => id === value);
}

/** What a flask leaves on the floor. */
export type ThrownSurface = 'fire' | 'grease';

export type ThrowableDef = {
  id: ThrowableId;
  name: string;
  /** How far it is thrown and how wide it splashes (px). */
  range: number;
  radius: number;
  /** The save everyone in the splash makes, and its DC. */
  save: StatName;
  dc: number;
  /** The splash's damage on a failed save (none for grease), and its kind. */
  damage: Dice | null;
  damageType: DamageType;
  /** How long a body that failed burns (ticks; 0: it does not catch fire), and what each round of burning deals. */
  burnTicks: number;
  burnDamage: Dice | null;
  /** What it leaves on the floor, how long (ticks; 0: for good) and the DC of the save it asks of whoever enters it. */
  surface: ThrownSurface;
  surfaceTicks: number;
  surfaceDc: number;
};

const isDamageType = (v: unknown): v is DamageType => DAMAGE_TYPES.some((t) => t === v);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const diceOf = (v: unknown): Dice | null => (typeof v === 'string' ? parseDice(v) : null);

/** One flask from the file, checked: a mistake there stops the game with a clear message. */
function readThrowable(id: ThrowableId, raw: unknown): ThrowableDef {
  ensure(isRecord(raw) && typeof raw.name === 'string' && isStatName(raw.save), `Bad throwable ${id}`, { id });
  ensure(isRecord(raw) && (raw.surface === 'fire' || raw.surface === 'grease'), `Unknown surface for throwable ${id}`, { id });
  ensure(isRecord(raw) && (raw.damageType === undefined || isDamageType(raw.damageType)), `Unknown damage type for throwable ${id}`, { id });
  const r = isRecord(raw) ? raw : {};
  return {
    id,
    name: typeof r.name === 'string' ? r.name : id,
    range: feetToPx(num(r.rangeFeet)),
    radius: feetToPx(num(r.radiusFeet)),
    save: isStatName(r.save) ? r.save : 'dexterity',
    dc: num(r.dc),
    damage: diceOf(r.damage),
    damageType: isDamageType(r.damageType) ? r.damageType : 'fire',
    burnTicks: Math.round(num(r.burnSeconds) * TICKS_PER_SECOND),
    burnDamage: diceOf(r.burnDamage),
    surface: r.surface === 'grease' ? 'grease' : 'fire',
    surfaceTicks: Math.round(num(r.surfaceSeconds) * TICKS_PER_SECOND),
    surfaceDc: num(r.surfaceDc),
  };
}

export const THROWABLES = {
  alchemists_fire: readThrowable('alchemists_fire', throwables.alchemists_fire),
  grease_bottle: readThrowable('grease_bottle', throwables.grease_bottle),
} as const satisfies Record<ThrowableId, ThrowableDef>;
