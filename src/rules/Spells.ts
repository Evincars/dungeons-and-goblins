import { isStatName } from '../world';
import type { StatName } from '../world';
import { ensure } from '../core/errors';
import { hasKey, isRecord } from '../core/guards';
import { EFFECT_COLOURS, EFFECT_SHAPES } from '../assets/Effects';
import type { EffectColour, EffectShape } from '../assets/Effects';
import { MAGICAL_DAMAGE_TYPES } from './DamageTypes';
import type { MagicalDamageType } from './DamageTypes';
import { parseDice } from './Dice';
import type { Dice } from './Dice';
import spells from '../data/spells.json';

/**
 * The spells heroes cast, read from src/data/spells.json (tune them there). No spell slots: each spell has a
 * recovery time before it can be cast again, and a short rest recovers them all.
 */

export const SPELL_IDS = [
  'fire_bolt', 'ray_of_frost', 'chill_touch', 'eldritch_blast', 'vicious_mockery', 'sacred_flame',
  'chromatic_orb', 'magic_missile', 'burning_hands', 'thunderwave', 'guiding_bolt', 'healing_word', 'cure_wounds',
  'acid_splash', 'poison_spray', 'produce_flame', 'shocking_grasp', 'thorn_whip', 'toll_the_dead',
  'dissonant_whispers', 'ice_knife', 'inflict_wounds', 'ray_of_sickness', 'witch_bolt', 'melfs_acid_arrow',
  'prayer_of_healing', 'scorching_ray', 'shatter', 'conjure_barrage', 'fireball', 'lightning_bolt',
  'mass_healing_word', 'blight', 'ice_storm', 'cone_of_cold', 'flame_strike', 'mass_cure_wounds',
  'chain_lightning', 'circle_of_death', 'disintegrate', 'harm', 'heal', 'otilukes_freezing_sphere',
] as const;
export type SpellId = (typeof SPELL_IDS)[number];

export function isSpellId(value: unknown): value is SpellId {
  return SPELL_IDS.some((id) => id === value);
}

/** bolt: a projectile, rolled to hit. missiles: darts that always hit. burst: an area, saved against. heal: the caster (and, with a radius, the heroes near). */
export const SPELL_KINDS = ['bolt', 'missiles', 'burst', 'heal'] as const;
export type SpellKind = (typeof SPELL_KINDS)[number];

export const SPELL_DAMAGE_TYPES = MAGICAL_DAMAGE_TYPES;
export type SpellDamageType = MagicalDamageType;

/** Ticks a second of recovery lasts (the game runs 60 a second). */
export const TICKS_PER_SECOND = 60;

export type SpellDef = {
  id: SpellId;
  kind: SpellKind;
  /** The spell's own level: 0 for a cantrip. */
  level: number;
  damage: Dice;
  damageType: SpellDamageType;
  /** Ticks before it can be cast again. */
  recoveryTicks: number;
  /** Darts a missiles spell looses. */
  count: number;
  /** A burst's saving throw, how far from the caster it may be centred (0: on the caster) and how wide it is (px). */
  save: StatName;
  range: number;
  radius: number;
  effect: { shape: EffectShape; colour: EffectColour; scale: number };
};

const isKind = (v: unknown): v is SpellKind => SPELL_KINDS.some((k) => k === v);
const isDamageType = (v: unknown): v is SpellDamageType => SPELL_DAMAGE_TYPES.some((t) => t === v);
const isShape = (v: unknown): v is EffectShape => typeof v === 'string' && hasKey(EFFECT_SHAPES, v);
const isColour = (v: unknown): v is EffectColour => EFFECT_COLOURS.some((c) => c === v);
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** One spell from the file, checked: a mistake there stops the game with a clear message instead of half-working. */
function readSpell(id: SpellId, raw: unknown): SpellDef {
  ensure(isRecord(raw) && isKind(raw.kind) && isDamageType(raw.damageType), `Bad kind or damage type for spell ${id}`, { id });
  const damage = typeof raw.damage === 'string' ? parseDice(raw.damage) : null;
  ensure(damage !== null, `Bad damage dice for spell ${id}`, { id });
  const effect = Array.isArray(raw.effect) ? raw.effect : [];
  ensure(isShape(effect[0]) && isColour(effect[1]), `Unknown effect for spell ${id}`, { id });
  ensure(raw.save === undefined || isStatName(raw.save), `Unknown saving throw for spell ${id}`, { id });
  return {
    id,
    kind: isKind(raw.kind) ? raw.kind : 'bolt',
    level: num(raw.level, 1),
    damage: damage ?? { count: 1, sides: 4, bonus: 0 },
    damageType: isDamageType(raw.damageType) ? raw.damageType : 'force',
    recoveryTicks: Math.round(num(raw.recovery, 1) * TICKS_PER_SECOND),
    count: num(raw.count, 1),
    save: isStatName(raw.save) ? raw.save : 'dexterity',
    range: num(raw.range, 0),
    radius: num(raw.radius, 0),
    effect: { shape: isShape(effect[0]) ? effect[0] : 'star_burst', colour: isColour(effect[1]) ? effect[1] : 'white', scale: num(raw.effectScale, 1) },
  };
}

export const SPELLS = {
  fire_bolt: readSpell('fire_bolt', spells.fire_bolt),
  ray_of_frost: readSpell('ray_of_frost', spells.ray_of_frost),
  chill_touch: readSpell('chill_touch', spells.chill_touch),
  eldritch_blast: readSpell('eldritch_blast', spells.eldritch_blast),
  vicious_mockery: readSpell('vicious_mockery', spells.vicious_mockery),
  sacred_flame: readSpell('sacred_flame', spells.sacred_flame),
  chromatic_orb: readSpell('chromatic_orb', spells.chromatic_orb),
  magic_missile: readSpell('magic_missile', spells.magic_missile),
  burning_hands: readSpell('burning_hands', spells.burning_hands),
  thunderwave: readSpell('thunderwave', spells.thunderwave),
  guiding_bolt: readSpell('guiding_bolt', spells.guiding_bolt),
  healing_word: readSpell('healing_word', spells.healing_word),
  cure_wounds: readSpell('cure_wounds', spells.cure_wounds),
  acid_splash: readSpell('acid_splash', spells.acid_splash),
  poison_spray: readSpell('poison_spray', spells.poison_spray),
  produce_flame: readSpell('produce_flame', spells.produce_flame),
  shocking_grasp: readSpell('shocking_grasp', spells.shocking_grasp),
  thorn_whip: readSpell('thorn_whip', spells.thorn_whip),
  toll_the_dead: readSpell('toll_the_dead', spells.toll_the_dead),
  dissonant_whispers: readSpell('dissonant_whispers', spells.dissonant_whispers),
  ice_knife: readSpell('ice_knife', spells.ice_knife),
  inflict_wounds: readSpell('inflict_wounds', spells.inflict_wounds),
  ray_of_sickness: readSpell('ray_of_sickness', spells.ray_of_sickness),
  witch_bolt: readSpell('witch_bolt', spells.witch_bolt),
  melfs_acid_arrow: readSpell('melfs_acid_arrow', spells.melfs_acid_arrow),
  prayer_of_healing: readSpell('prayer_of_healing', spells.prayer_of_healing),
  scorching_ray: readSpell('scorching_ray', spells.scorching_ray),
  shatter: readSpell('shatter', spells.shatter),
  conjure_barrage: readSpell('conjure_barrage', spells.conjure_barrage),
  fireball: readSpell('fireball', spells.fireball),
  lightning_bolt: readSpell('lightning_bolt', spells.lightning_bolt),
  mass_healing_word: readSpell('mass_healing_word', spells.mass_healing_word),
  blight: readSpell('blight', spells.blight),
  ice_storm: readSpell('ice_storm', spells.ice_storm),
  cone_of_cold: readSpell('cone_of_cold', spells.cone_of_cold),
  flame_strike: readSpell('flame_strike', spells.flame_strike),
  mass_cure_wounds: readSpell('mass_cure_wounds', spells.mass_cure_wounds),
  chain_lightning: readSpell('chain_lightning', spells.chain_lightning),
  circle_of_death: readSpell('circle_of_death', spells.circle_of_death),
  disintegrate: readSpell('disintegrate', spells.disintegrate),
  harm: readSpell('harm', spells.harm),
  heal: readSpell('heal', spells.heal),
  otilukes_freezing_sphere: readSpell('otilukes_freezing_sphere', spells.otilukes_freezing_sphere),
} as const satisfies Record<SpellId, SpellDef>;
