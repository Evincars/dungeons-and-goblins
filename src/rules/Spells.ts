import { isStatName } from '../world';
import type { StatName } from '../world';
import { ensure } from '../core/errors';
import { hasKey, isRecord } from '../core/guards';
import { EFFECT_COLOURS, EFFECT_SHAPES } from '../assets/Effects';
import type { EffectColour, EffectShape } from '../assets/Effects';
import { DAMAGE_TYPES } from './DamageTypes';
import type { DamageType } from './DamageTypes';
import { parseDice } from './Dice';
import type { Dice } from './Dice';
import { isCreatureType, isHoldKind } from './Conditions';
import type { CreatureType, HoldKind } from './Conditions';
import { feetToPx } from './Scale';
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
  'blade_ward', 'shield', 'mage_armor', 'false_life', 'stoneskin', 'arms_of_hadar', 'sunbeam', 'phantasmal_killer', 'vampiric_touch',
  'cloud_of_daggers', 'cloudkill', 'hunger_of_hadar', 'spirit_guardians', 'insect_plague', 'create_or_destroy_water',
  'dancing_lights', 'true_strike', 'grease', 'sleep', 'longstrider', 'protection_from_evil_and_good', 'fog_cloud',
  'charm_person', 'tashas_hideous_laughter', 'blindness', 'hold_person', 'crown_of_madness', 'ray_of_enfeeblement', 'blur',
  'mirror_image', 'shadow_blade', 'see_invisibility', 'magic_weapon', 'invisibility', 'darkness', 'flaming_sphere', 'gust_of_wind',
  'misty_step', 'web',
] as const;
export type SpellId = (typeof SPELL_IDS)[number];

export function isSpellId(value: unknown): value is SpellId {
  return SPELL_IDS.some((id) => id === value);
}

/**
 * bolt: a projectile, rolled to hit. missiles: darts that always hit. burst: an area, saved against. heal: the caster (and,
 * with a radius, the heroes near). buff: something that lasts on the caster (systems/LastingSpells.ts). zone: an area that
 * strikes whoever is in it every round while it lasts. water: a puddle where the caster aims. lights: hovering lights that shed light and draw foes (Dancing Lights,
 * systems/DancingLights.ts). surface: grease where the caster aims (Grease, systems/Surfaces.ts). sleep: a mote flying as a
 * bolt that lulls the first foe it touches to sleep (Sleep, systems/SleepSpell.ts). ally: a buff on a hero the caster picks
 * (Longstrider, Protection from Evil and Good, systems/AllySpells.ts). fog: a cloud that heavily obscures (Fog Cloud,
 * systems/FogCloud.ts; Darkness, darker). hex: a foe the caster picks saves or is held in a condition (Charm Person, Tasha's
 * Hideous Laughter, Blindness/Deafness, Hold Person, Crown of Madness, systems/SpellHolds.ts). gust: a line of wind from the
 * caster that pushes whoever it catches (Gust of Wind, systems/GustOfWind.ts). teleport: the caster steps through mist to where
 * they aim (Misty Step, systems/MistyStep.ts).
 */
export const SPELL_KINDS = ['bolt', 'missiles', 'burst', 'heal', 'buff', 'zone', 'water', 'lights', 'surface', 'sleep', 'ally', 'fog', 'hex', 'gust', 'teleport'] as const;
export type SpellKind = (typeof SPELL_KINDS)[number];

/**
 * What a buff spell does to its caster: resist weapons (Blade Ward, Stoneskin), +5 AC (Shield), AC 13 + DEX (Mage Armour),
 * temporary hit points (False Life), advantage on the next attack roll (True Strike); on the hero picked (an `ally` spell): 10
 * feet more speed (Longstrider), undead attacking at disadvantage (Protection from Evil and Good). Blur (attacks at the caster
 * at disadvantage), Mirror Image (duplicates that draw attacks), Shadow Blade (a blade of shadow in hand), See Invisibility;
 * on the hero picked: Magic Weapon (+1 to hit and damage), Invisibility.
 */
export const BUFF_IDS = [
  'blade_ward', 'shield', 'mage_armor', 'false_life', 'stoneskin', 'true_strike', 'longstrider', 'protection_from_evil_and_good',
  'blur', 'mirror_image', 'shadow_blade', 'see_invisibility', 'magic_weapon', 'invisibility',
] as const;
export type BuffId = (typeof BUFF_IDS)[number];
const isBuff = (v: unknown): v is BuffId => BUFF_IDS.some((b) => b === v);

/**
 * The shape of a burst (src/rules/SpellArea.ts): a sphere round the point it goes off at, a cube (a square on the map) centred
 * there, a cone from the caster's hands towards the aim, or a line from them (Lightning Bolt: `range` long, `radius` each side).
 */
export const SPELL_AREAS = ['sphere', 'cube', 'cone', 'line'] as const;
export type SpellArea = (typeof SPELL_AREAS)[number];
const isArea = (v: unknown): v is SpellArea => SPELL_AREAS.some((a) => a === v);

/** Every damage type, weapons' too: a cloud of daggers slashes, a swarm of insects pierces. */
export const SPELL_DAMAGE_TYPES = DAMAGE_TYPES;
export type SpellDamageType = DamageType;

/** What a surface spell spreads: grease (Grease) or webs (Web). */
export const SPELL_SURFACES = ['grease', 'web'] as const;
export type SpellSurface = (typeof SPELL_SURFACES)[number];
const isSpellSurface = (v: unknown): v is SpellSurface => SPELL_SURFACES.some((k) => k === v);

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
  /** A burst's or zone's saving throw (null: none, it always strikes), how far from the caster it may be centred (0: on the caster) and how wide it is (px). */
  save: StatName | null;
  range: number;
  radius: number;
  /** The shape of the area a burst strikes. */
  area: SpellArea;
  /** A buff spell's effect; how long a buff or zone lasts (ticks; 0: until a long rest). */
  buff: BuffId | null;
  durationTicks: number;
  /** Held by concentration: casting another such spell, or failing a Constitution save when hurt, ends it. */
  concentration: boolean;
  /** The share of a bolt's damage its caster regains as hit points (Vampiric Touch: half). */
  drain: number;
  /** The condition a hex (or a bolt that hits) holds its target in, the creature types it takes (null: any) and the least Intelligence. */
  condition: HoldKind | 'charmed' | null;
  creatures: readonly CreatureType[] | null;
  minIntelligence: number;
  /** The foes more a hex takes for each level it is cast above its own (Charm Person, Hold Person, Blindness: one). */
  targetsPerLevel: number;
  /** A fog that is Darkness; a zone that rolls where its caster aims (Flaming Sphere); how far a gust pushes (px); what a surface spreads. */
  dark: boolean;
  rolls: boolean;
  push: number;
  surface: SpellSurface;
  effect: { shape: EffectShape; colour: EffectColour; scale: number };
};

const isKind = (v: unknown): v is SpellKind => SPELL_KINDS.some((k) => k === v);
const isDamageType = (v: unknown): v is SpellDamageType => SPELL_DAMAGE_TYPES.some((t) => t === v);
const isShape = (v: unknown): v is EffectShape => typeof v === 'string' && hasKey(EFFECT_SHAPES, v);
const isColour = (v: unknown): v is EffectColour => EFFECT_COLOURS.some((c) => c === v);
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** What a spell that rolls nothing has as its dice. */
const NO_DICE: Dice = { count: 0, sides: 4, bonus: 0 };

/** One spell from the file, checked: a mistake there stops the game with a clear message instead of half-working. */
function readSpell(id: SpellId, raw: unknown): SpellDef {
  ensure(isRecord(raw) && isKind(raw.kind) && (raw.damageType === undefined || isDamageType(raw.damageType)), `Bad kind or damage type for spell ${id}`, { id });
  // A buff or a puddle rolls nothing: no dice in the file.
  const damage = typeof raw.damage === 'string' ? parseDice(raw.damage) : NO_DICE;
  ensure(damage !== null, `Bad damage dice for spell ${id}`, { id });
  ensure(raw.buff === undefined || isBuff(raw.buff), `Unknown buff for spell ${id}`, { id });
  const effect = Array.isArray(raw.effect) ? raw.effect : [];
  ensure(isShape(effect[0]) && isColour(effect[1]), `Unknown effect for spell ${id}`, { id });
  ensure(raw.save === undefined || isStatName(raw.save), `Unknown saving throw for spell ${id}`, { id });
  ensure(raw.area === undefined || isArea(raw.area), `Unknown area for spell ${id}`, { id });
  ensure(raw.condition === undefined || raw.condition === 'charmed' || isHoldKind(raw.condition), `Unknown condition for spell ${id}`, { id });
  ensure(raw.surface === undefined || isSpellSurface(raw.surface), `Unknown surface for spell ${id}`, { id });
  const creatures = Array.isArray(raw.creatures) ? raw.creatures : null;
  ensure(creatures === null || creatures.every(isCreatureType), `Unknown creature type for spell ${id}`, { id });
  return {
    id,
    kind: isKind(raw.kind) ? raw.kind : 'bolt',
    level: num(raw.level, 1),
    damage: damage ?? { count: 1, sides: 4, bonus: 0 },
    damageType: isDamageType(raw.damageType) ? raw.damageType : 'force',
    recoveryTicks: Math.round(num(raw.recovery, 1) * TICKS_PER_SECOND),
    count: num(raw.count, 1),
    // A burst always has a save (Dexterity unless named); anything else only the one it names.
    save: isStatName(raw.save) ? raw.save : raw.kind === 'burst' ? 'dexterity' : null,
    range: num(raw.range, 0),
    radius: num(raw.radius, 0),
    area: isArea(raw.area) ? raw.area : 'sphere',
    buff: isBuff(raw.buff) ? raw.buff : null,
    durationTicks: Math.round(num(raw.seconds, 0) * TICKS_PER_SECOND),
    concentration: raw.concentration === true,
    drain: num(raw.drain, 0),
    condition: raw.condition === 'charmed' || isHoldKind(raw.condition) ? raw.condition : null,
    creatures: creatures ? creatures.filter(isCreatureType) : null,
    minIntelligence: num(raw.minIntelligence, 0),
    targetsPerLevel: num(raw.targetsPerLevel, 0),
    dark: raw.dark === true,
    rolls: raw.rolls === true,
    push: feetToPx(num(raw.push, 0)),
    surface: isSpellSurface(raw.surface) ? raw.surface : 'grease',
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
  blade_ward: readSpell('blade_ward', spells.blade_ward),
  shield: readSpell('shield', spells.shield),
  mage_armor: readSpell('mage_armor', spells.mage_armor),
  false_life: readSpell('false_life', spells.false_life),
  stoneskin: readSpell('stoneskin', spells.stoneskin),
  arms_of_hadar: readSpell('arms_of_hadar', spells.arms_of_hadar),
  sunbeam: readSpell('sunbeam', spells.sunbeam),
  phantasmal_killer: readSpell('phantasmal_killer', spells.phantasmal_killer),
  vampiric_touch: readSpell('vampiric_touch', spells.vampiric_touch),
  cloud_of_daggers: readSpell('cloud_of_daggers', spells.cloud_of_daggers),
  cloudkill: readSpell('cloudkill', spells.cloudkill),
  hunger_of_hadar: readSpell('hunger_of_hadar', spells.hunger_of_hadar),
  spirit_guardians: readSpell('spirit_guardians', spells.spirit_guardians),
  insect_plague: readSpell('insect_plague', spells.insect_plague),
  create_or_destroy_water: readSpell('create_or_destroy_water', spells.create_or_destroy_water),
  dancing_lights: readSpell('dancing_lights', spells.dancing_lights),
  true_strike: readSpell('true_strike', spells.true_strike),
  grease: readSpell('grease', spells.grease),
  sleep: readSpell('sleep', spells.sleep),
  longstrider: readSpell('longstrider', spells.longstrider),
  protection_from_evil_and_good: readSpell('protection_from_evil_and_good', spells.protection_from_evil_and_good),
  fog_cloud: readSpell('fog_cloud', spells.fog_cloud),
  charm_person: readSpell('charm_person', spells.charm_person),
  tashas_hideous_laughter: readSpell('tashas_hideous_laughter', spells.tashas_hideous_laughter),
  blindness: readSpell('blindness', spells.blindness),
  hold_person: readSpell('hold_person', spells.hold_person),
  crown_of_madness: readSpell('crown_of_madness', spells.crown_of_madness),
  ray_of_enfeeblement: readSpell('ray_of_enfeeblement', spells.ray_of_enfeeblement),
  blur: readSpell('blur', spells.blur),
  mirror_image: readSpell('mirror_image', spells.mirror_image),
  shadow_blade: readSpell('shadow_blade', spells.shadow_blade),
  see_invisibility: readSpell('see_invisibility', spells.see_invisibility),
  magic_weapon: readSpell('magic_weapon', spells.magic_weapon),
  invisibility: readSpell('invisibility', spells.invisibility),
  darkness: readSpell('darkness', spells.darkness),
  flaming_sphere: readSpell('flaming_sphere', spells.flaming_sphere),
  gust_of_wind: readSpell('gust_of_wind', spells.gust_of_wind),
  misty_step: readSpell('misty_step', spells.misty_step),
  web: readSpell('web', spells.web),
} as const satisfies Record<SpellId, SpellDef>;
