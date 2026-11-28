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
 * The flasks and potions (src/data/throwables.json): Alchemist's Fire, which splashes fire, sets whoever fails their save
 * alight and leaves the floor burning; the Grease Bottle, which leaves slick grease where feet slip (and fire takes); the
 * potions of healing, drunk or thrown — their splash heals every creature it wets, a foe as well as a friend. Enemies throw
 * the flasks; heroes carry them all in the bag (entities/ItemCatalog.ts makes the items) and throw any of them.
 */

export const THROWABLE_IDS = [
  'alchemists_fire', 'grease_bottle',
  'potion_of_healing', 'potion_of_greater_healing', 'potion_of_superior_healing', 'potion_of_supreme_healing',
] as const;
export type ThrowableId = (typeof THROWABLE_IDS)[number];

export function isThrowableId(value: unknown): value is ThrowableId {
  return THROWABLE_IDS.some((id) => id === value);
}

/**
 * What flies through the air (the `thrown` component): a flask or a potion, or anything else a hero hurls out of the bag
 * (`object`: a dagger, a boot), which strikes the foe it lands on.
 */
export type ThrownKind = ThrowableId | 'object';

export function isThrownKind(value: unknown): value is ThrownKind {
  return value === 'object' || isThrowableId(value);
}

/** What a flask leaves on the floor. */
export type ThrownSurface = 'fire' | 'grease';

export type ThrowableDef = {
  id: ThrowableId;
  name: string;
  /** How far it is thrown and how wide it splashes (px). */
  range: number;
  radius: number;
  /** The save everyone in the splash makes, and its DC (no save: a potion). */
  save: StatName | null;
  dc: number;
  /** The splash's damage on a failed save (none for grease), and its kind. */
  damage: Dice | null;
  damageType: DamageType;
  /** How long a body that failed burns (ticks; 0: it does not catch fire), and what each round of burning deals. */
  burnTicks: number;
  burnDamage: Dice | null;
  /** What it leaves on the floor (nothing: a potion), how long (ticks; 0: for good) and the DC of the save it asks of whoever enters it. */
  surface: ThrownSurface | null;
  surfaceTicks: number;
  surfaceDc: number;
  /** A potion's healing, drunk or splashed (null: not a potion). */
  heal: Dice | null;
  /** The item in the bag: its price (gold), weight (kg) and picture (a path under public/). */
  cost: number;
  weight: number;
  icon: string;
};

const isDamageType = (v: unknown): v is DamageType => DAMAGE_TYPES.some((t) => t === v);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const diceOf = (v: unknown): Dice | null => (typeof v === 'string' ? parseDice(v) : null);
const surfaceOf = (v: unknown): ThrownSurface | null => (v === 'fire' || v === 'grease' ? v : null);

/** One flask or potion from the file, checked: a mistake there stops the game with a clear message. */
function readThrowable(id: ThrowableId, raw: unknown): ThrowableDef {
  ensure(isRecord(raw) && typeof raw.name === 'string' && typeof raw.icon === 'string', `Bad throwable ${id}`, { id });
  ensure(isRecord(raw) && (raw.save === undefined || isStatName(raw.save)), `Unknown save for throwable ${id}`, { id });
  ensure(isRecord(raw) && (raw.surface === undefined || surfaceOf(raw.surface) !== null), `Unknown surface for throwable ${id}`, { id });
  ensure(isRecord(raw) && (raw.damageType === undefined || isDamageType(raw.damageType)), `Unknown damage type for throwable ${id}`, { id });
  ensure(isRecord(raw) && (raw.heal === undefined || diceOf(raw.heal) !== null), `Bad healing dice for throwable ${id}`, { id });
  const r = isRecord(raw) ? raw : {};
  return {
    id,
    name: typeof r.name === 'string' ? r.name : id,
    range: feetToPx(num(r.rangeFeet)),
    radius: feetToPx(num(r.radiusFeet)),
    save: isStatName(r.save) ? r.save : null,
    dc: num(r.dc),
    damage: diceOf(r.damage),
    damageType: isDamageType(r.damageType) ? r.damageType : 'fire',
    burnTicks: Math.round(num(r.burnSeconds) * TICKS_PER_SECOND),
    burnDamage: diceOf(r.burnDamage),
    surface: surfaceOf(r.surface),
    surfaceTicks: Math.round(num(r.surfaceSeconds) * TICKS_PER_SECOND),
    surfaceDc: num(r.surfaceDc),
    heal: diceOf(r.heal),
    cost: num(r.cost),
    weight: num(r.weight),
    icon: typeof r.icon === 'string' ? r.icon : '',
  };
}

export const THROWABLES = {
  alchemists_fire: readThrowable('alchemists_fire', throwables.alchemists_fire),
  grease_bottle: readThrowable('grease_bottle', throwables.grease_bottle),
  potion_of_healing: readThrowable('potion_of_healing', throwables.potion_of_healing),
  potion_of_greater_healing: readThrowable('potion_of_greater_healing', throwables.potion_of_greater_healing),
  potion_of_superior_healing: readThrowable('potion_of_superior_healing', throwables.potion_of_superior_healing),
  potion_of_supreme_healing: readThrowable('potion_of_supreme_healing', throwables.potion_of_supreme_healing),
} as const satisfies Record<ThrowableId, ThrowableDef>;

/** The texture key of a flask's or potion's picture. */
export const throwableIconKey = (id: ThrowableId): string => `item_${id}`;

/**
 * Anything else a hero throws (D&D's improvised weapon): 1d4 bludgeoning plus Strength, rolled to hit with Strength and
 * no proficiency, as far as 60 feet; a weapon made for throwing (a dagger, a javelin) flies as its own table says.
 */
export const IMPROVISED_DAMAGE: Dice = { count: 1, sides: 4, bonus: 0 };
export const IMPROVISED_RANGE_FEET = 60;
