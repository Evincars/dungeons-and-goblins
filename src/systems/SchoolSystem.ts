import type { AreaShape } from '../rules/SpellArea';
import { world, q, isActivePlayer, isMob, isPlayer, isTarget } from '../world';
import type { Entity, Player, TransmuterStone } from '../world';
import type { Level } from '../level/Level';
import { text } from '../core/texts';
import { characterSheet } from '../rules/CharacterSheet';
import { featureOn, featureOfClass, featureUses, hasClassFeature } from '../rules/ClassFeatures';
import { heroClass } from '../rules/Classes';
import { schoolOf } from '../rules/Archetypes';
import { bladesongImpeded } from '../rules/Schools';
import { CATALOG, castDef, isCatalogSpell, quickBinding } from '../rules/Spellbook';
import { SPELLS, isSpellId } from '../rules/Spells';
import { MONSTERS } from '../rules/Monsters';
import { resolveAttack } from '../rules/Combat';
import type { AttackOutcome, AttackProfile } from '../rules/Combat';
import { rollCheck, rollDice, rollDie } from '../rules/Dice';
import { monsterAttack } from '../rules/CharacterSheet';
import { nearby, Sense } from '../ai/perception/spatial';
import { MAX_MOB_RADIUS } from '../entities/MobFactory';
import { AIM_HEIGHT } from '../entities/ProjectileFactory';
import { playAura, playEffect } from '../assets/Effects';
import type { Aura } from '../assets/Effects';
import { charm, spellSaveMode } from './ManeuverSystem';
import { armorClassOf, strike } from './Strike';
import { hitMob } from './Hits';
import { logHeal, logLine, logSaveDamage } from './RollLogSystem';
import { createPuddle } from './LastingSpells';
import { lure, placeDecoy } from './DecoySystem';
import { recordEvent } from './CombatLogSystem';

/**
 * The Wizard's schools at play (their rules: src/data/features.json and src/rules/Schools.ts; the undead of Animate Dead:
 * systems/SummonSystem.ts). What a school keeps between uses is the hero's `arcana`: the Arcane Ward, the Portent dice,
 * the Bladesong and the Transmuter's Stone, and the recoveries of the features that work by themselves. The turn-based
 * game's rounds are 6 seconds here, and what a rest gave back recovers in time instead.
 */

type Arcana = NonNullable<Entity['arcana']>;

/** Ticks in a round of the tabletop game (6 seconds): "once a turn" works at most this often. */
const TURN_TICKS = 360;
/** Sides of the die Portent foresees. */
const D20 = 20;
/** Portent's dice are foreseen again within this many ticks, shared among them (60 seconds: a long rest's worth). */
const PORTENT_RECOVERY_TICKS = 3600;
/** A diviner turns the rolls of foes this near the hero they attack (30 feet, at 48 px to 5 feet). */
const PORTENT_REACH = 288;
/** Projected Ward shields allies this near the abjurer (30 feet). */
const PROJECTED_WARD_REACH = 288;
/** Hypnotic Gaze reaches a foe this near the enchanter (10 feet), past the foe's own body. */
const HYPNOTIC_REACH = 96;
/** A charm from Hypnotic Gaze lasts 2 rounds. */
const HYPNOTIC_TICKS = 2 * TURN_TICKS;
/** Sculpt Spells' bubble lasts a round (6 s), and is never narrower than this (px), even round a bolt's point. */
const SCULPT_TICKS = 360;
const SCULPT_MIN_RADIUS = 48;
/** The bubble's shimmer is played afresh this often (ticks), as wide as it is. */
const SCULPT_PULSE_TICKS = 60;
const SCULPT_EFFECT = { shape: 'ring_pulse', colour: 'amber' } as const;
/** The art of SCULPT_EFFECT is this wide (px) at scale 1: a bubble of another radius scales it. */
const SCULPT_ART_RADIUS = 40;
/** Improved Minor Illusion's dummy is made up to 60 feet away, and lures the foes within 20 feet of it. */
const ILLUSION_RANGE = 576;
const ILLUSION_RADIUS = 192;
/** Illusory Self works again after 30 seconds (a short rest's worth). */
const ILLUSORY_SELF_TICKS = 1800;
/** Benign Transposition teleports up to 30 feet; aiming this near an ally swaps places with them. */
const TELEPORT_REACH = 288;
const SWAP_REACH = 24;
/** Benign Transposition looks for a place to land in steps this long, from the far end back toward the wizard. */
const TELEPORT_STEP = 12;
/** Bladesong lasts 10 rounds (60 seconds). */
const BLADESONG_TICKS = 10 * TURN_TICKS;
/** Bladesong Climax goes off up to 30 feet away and reaches 10 feet round that point; it rolls a d6, and a d6 more a charge. */
const CLIMAX_RANGE = 288;
const CLIMAX_RADIUS = 96;
const CLIMAX_DIE = 6;
/** Create Water: a puddle up to 30 feet away, about 5 feet across each way. */
const CREATE_WATER_RANGE = 288;
const CREATE_WATER_RADIUS = 28;
/**
 * The class features aimed at an area, as the aim guide shows them (systems/AimGuideSystem.ts): Minor Conjuration's puddle,
 * a circle where it lands, no further off than it reaches.
 */
export const FEATURE_AREAS: Readonly<Partial<Record<string, AreaShape>>> = {
  minor_conjuration: { area: 'sphere', range: CREATE_WATER_RANGE, radius: CREATE_WATER_RADIUS },
};
/** Song of Defence takes this much damage off for every level of the spell it spends. */
const SONG_OF_DEFENCE_PER_LEVEL = 5;
/** Grim Harvest gives back hit points of twice the spell's level, three times for a Necromancy spell. */
const GRIM_HARVEST_FACTOR = 2;
const GRIM_HARVEST_NECROMANCY = 3;
/** Instinctive Charm turns a blow on a foe this close to the attacker (past both bodies). */
const CHARM_REDIRECT_REACH = 8;

const BLADESONG_AURA: Aura = { shape: 'halo_ring', tint: 0x9ad8ff, ticks: 40, lift: AIM_HEIGHT, scale: 0.9 };
const STONE_AURA: Aura = { shape: 'halo_ring', tint: 0xd8b45a, ticks: 36, lift: AIM_HEIGHT, scale: 0.8 };
const CHARM_EFFECT = { shape: 'sparkle_ring', colour: 'mauve', scale: 0.8 } as const;
const ILLUSION_EFFECT = { shape: 'swirl_bloom', colour: 'violet', scale: 1.2 } as const;
const TELEPORT_EFFECT = { shape: 'sparkle_ring', colour: 'azure', scale: 1 } as const;
const WARD_EFFECT = { shape: 'ring_pulse', colour: 'azure', scale: 0.7 } as const;
const CLIMAX_EFFECT = { shape: 'blade_pinwheel', colour: 'azure', scale: 2 } as const;
const CLIMAX_HEAL_EFFECT = { shape: 'sparkle_ring', colour: 'green', scale: 1 } as const;
const WATER_EFFECT = { shape: 'splash_curl', colour: 'azure', scale: 1.2 } as const;
const SIGHT_AURA: Aura = { shape: 'eye_ring', tint: 0xd8c8ff, ticks: 40, lift: AIM_HEIGHT, scale: 0.8 };

const scratch: Entity[] = [];

// ── The school's state ────────────────────────────────────────────────────────

/** How many Portent dice the hero foresees: two, three with Expert Divination, none without Portent. */
function portentDice(hero: Player): number {
  if (!featureOn(hero, 'portent')) return 0;
  return featureOn(hero, 'expert_divination') ? 3 : 2;
}

/** The Arcane Ward is never stronger than twice the wizard's level. */
const wardCap = (hero: Player): number => 2 * hero.playerStats.level;

/** How many Bladesong charges the hero has at their level (none without Bladesong). */
function songChargesMax(hero: Player): number {
  const def = featureOfClass(heroClass(hero.heroClass).dndClass, 'bladesong');
  return def && hasClassFeature(hero, 'bladesong') ? featureUses(def, hero.playerStats.level) : 0;
}

/** A fresh state: the ward at the wizard's level (as after a long rest), every Portent die foreseen, every Bladesong charge ready. */
function freshArcana(hero: Player): Arcana {
  return {
    ward: hasClassFeature(hero, 'arcane_ward') ? hero.playerStats.level : 0,
    portent: Array.from({ length: portentDice(hero) }, () => rollDie(D20)),
    portentTicks: 0, harvestTicks: 0, charmTicks: 0, illusoryTicks: 0, songTicks: 0, defenceTicks: 0, stone: '',
    songCharges: songChargesMax(hero), damageCharges: 0, healingCharges: 0, darkvision: false, seeInvisible: false, splitTicks: 0,
  };
}

/** The hero's school state, made the first time it is needed. */
export function arcanaOf(hero: Player): Arcana {
  if (hero.arcana) return hero.arcana;
  const arcana = freshArcana(hero);
  world.addComponent(hero, 'arcana', arcana);
  return arcana;
}

const tick = (ticks: number): number => (ticks > 0 ? ticks - 1 : 0);

/** A used Portent die is foreseen again once its share of the recovery has passed. */
function regrowPortent(hero: Player, arcana: Arcana): void {
  const count = portentDice(hero);
  if (arcana.portent.length > count) arcana.portent.length = count;
  const each = count > 0 ? Math.round(PORTENT_RECOVERY_TICKS / count) : 0;
  if (arcana.portent.length >= count) {
    arcana.portentTicks = each;
    return;
  }
  arcana.portentTicks = tick(arcana.portentTicks);
  if (arcana.portentTicks > 0) return;
  arcana.portent.push(rollDie(D20));
  arcana.portentTicks = each;
}

/** The Bladesong runs down; when it ends, the Bladesong Charges it gathered are lost. */
function runDownSong(arcana: Arcana): void {
  arcana.songTicks = tick(arcana.songTicks);
  if (arcana.songTicks > 0) return;
  arcana.damageCharges = 0;
  arcana.healingCharges = 0;
}

/** Every wizard with a school: its recoveries run down a tick, and Portent's used dice come back in time. */
export function updateSchools(): void {
  for (const hero of q.players) {
    if (!schoolOf(hero.build)) continue;
    const arcana = arcanaOf(hero);
    arcana.harvestTicks = tick(arcana.harvestTicks);
    arcana.charmTicks = tick(arcana.charmTicks);
    arcana.illusoryTicks = tick(arcana.illusoryTicks);
    arcana.defenceTicks = tick(arcana.defenceTicks);
    arcana.splitTicks = tick(arcana.splitTicks);
    runDownSong(arcana);
    regrowPortent(hero, arcana);
  }
  runDownSculpts();
}

/**
 * A rest: everything that works by itself is ready again. A long rest sets the Arcane Ward to the wizard's level, foresees
 * every Portent die afresh and gives back every Bladesong charge (as going deeper does: the hero starts the level afresh);
 * a short one grows the ward by the wizard's level with Improved Abjuration.
 */
export function restSchool(hero: Player, long: boolean): void {
  if (!hero.arcana) return;
  const arcana = hero.arcana;
  arcana.harvestTicks = arcana.charmTicks = arcana.illusoryTicks = arcana.defenceTicks = arcana.splitTicks = 0;
  if (long) {
    arcana.songCharges = songChargesMax(hero);
    arcana.ward = freshArcana(hero).ward;
    arcana.portent = freshArcana(hero).portent;
    return;
  }
  if (featureOn(hero, 'improved_abjuration')) arcana.ward = Math.min(wardCap(hero), arcana.ward + hero.playerStats.level);
}

/** Whether the hero is singing their Bladesong now (impeded or not). */
export function singing(hero: Pick<Player, 'arcana'>): boolean {
  return (hero.arcana?.songTicks ?? 0) > 0;
}

/** Singing and not impeded (by armour, a shield or the wrong weapon): only then does the Bladesong gather charges. */
function singingFreely(hero: Player): boolean {
  return singing(hero) && !bladesongImpeded(hero.equipped ?? {});
}

/** A song gathers Bladesong Charges of each kind up to the hero's level (12 damage and 12 healing at level 12). */
const songChargeCap = (hero: Player): number => hero.playerStats.level;

/** Each weapon attack (every blow of a swing, Extra Attack's too, and every arrow) during an unimpeded Bladesong gathers a Healing Charge for its Climax. */
export function bladeAttack(hero: Player): void {
  const arcana = hero.arcana;
  if (!arcana || !singingFreely(hero)) return;
  arcana.healingCharges = Math.min(songChargeCap(hero), arcana.healingCharges + 1);
}

/** The charges an active feature has left to use, if it is used by charges (Bladesong); null for any other. */
export function featureCharges(hero: Player, id: string): number | null {
  if (id !== 'bladesong') return null;
  return hero.arcana ? hero.arcana.songCharges : songChargesMax(hero);
}

// ── Damage that reaches a hero ────────────────────────────────────────────────

/** A ward takes a blow: it blocks as much as its strength, then weakens by 1. Returns the damage left. */
function wardBlocks(holder: Player, warded: Player, damage: number): number {
  const arcana = arcanaOf(holder);
  const blocked = Math.min(damage, arcana.ward);
  arcana.ward = Math.max(0, arcana.ward - 1);
  playEffect(WARD_EFFECT.shape, WARD_EFFECT.colour, warded.position.x, warded.position.y, AIM_HEIGHT, WARD_EFFECT.scale);
  logLine(warded, text('roll.ward', { amount: blocked }), 'hit');
  return damage - blocked;
}

/** An abjurer near the hero whose Projected Ward holds (the hero's own ward comes first). */
function projectingWard(hero: Player): Player | undefined {
  for (const other of q.players) {
    if (other === hero || !isActivePlayer(other) || (other.arcana?.ward ?? 0) <= 0 || !featureOn(other, 'projected_ward')) continue;
    if (Math.hypot(other.position.x - hero.position.x, other.position.y - hero.position.y) <= PROJECTED_WARD_REACH) return other;
  }
  return undefined;
}

/** The ward that takes a blow aimed at the hero: their own, else a Projected Ward near them. */
function wardFor(hero: Player): Player | undefined {
  if ((hero.arcana?.ward ?? 0) > 0 && featureOn(hero, 'arcane_ward')) return hero;
  return projectingWard(hero);
}

/**
 * The spell Song of Defence spends: the lowest ready one (cast at 1st level or higher) whose 5 a level covers the damage,
 * else the highest ready one. Returns its quick-bar square, or -1.
 */
function songSpell(hero: Player, damage: number): number {
  let cover = -1;
  let coverLevel = Infinity;
  let top = -1;
  let topLevel = 0;
  const recovery = hero.spellbook?.recovery;
  for (let slot = 0; recovery && slot < recovery.length; slot++) {
    const binding = quickBinding(hero, slot);
    if (!binding || !isSpellId(binding.spell) || binding.level < 1 || recovery[slot] > 0) continue;
    const level = binding.level;
    if (level * SONG_OF_DEFENCE_PER_LEVEL >= damage && level < coverLevel) [cover, coverLevel] = [slot, level];
    if (level > topLevel) [top, topLevel] = [slot, level];
  }
  return cover >= 0 ? cover : top;
}

/** Song of Defence: during Bladesong a ready spell is spent to take 5 damage a level off a blow, once a round. Returns the damage left. */
function songOfDefence(hero: Player, damage: number): number {
  const arcana = hero.arcana;
  if (!arcana || !singing(hero) || arcana.defenceTicks > 0 || !featureOn(hero, 'song_of_defence')) return damage;
  const slot = songSpell(hero, damage);
  const binding = slot < 0 ? null : quickBinding(hero, slot);
  if (!binding || !isSpellId(binding.spell) || !hero.spellbook) return damage;
  hero.spellbook.recovery[slot] = castDef(SPELLS[binding.spell], binding.level, hero.playerStats.level).recoveryTicks;
  arcana.defenceTicks = TURN_TICKS;
  const taken = Math.min(damage, binding.level * SONG_OF_DEFENCE_PER_LEVEL);
  logLine(hero, text('roll.song_of_defence', { amount: taken }), 'hit');
  return damage - taken;
}

/** What is left of damage reaching a hero once an Arcane Ward and Song of Defence have taken their share. */
export function schoolShields(target: Entity, damage: number): number {
  if (!isPlayer(target)) return damage;
  const ward = wardFor(target);
  const left = ward ? wardBlocks(ward, target, damage) : damage;
  return left > 0 ? songOfDefence(target, left) : 0;
}

// ── Foes' blows and saves ─────────────────────────────────────────────────────

/** The diviner nearest the hero a foe attacks (the hero too) with a Portent die to spend, if any is within reach. */
function diviner(near: Player): Player | undefined {
  let found: Player | undefined;
  let best = Infinity;
  for (const hero of q.players) {
    if (!hero.arcana?.portent.length || !isActivePlayer(hero) || !featureOn(hero, 'portent')) continue;
    const d = Math.hypot(hero.position.x - near.position.x, hero.position.y - near.position.y);
    if (d > PORTENT_REACH || d >= best) continue;
    best = d;
    found = hero;
  }
  return found;
}

/** Spends the diviner's lowest (or highest) Portent die and says so over their head. */
function spendPortent(hero: Player, highest: boolean): number {
  const dice = arcanaOf(hero).portent;
  let at = 0;
  for (let i = 1; i < dice.length; i++) if (highest ? dice[i] > dice[at] : dice[i] < dice[at]) at = i;
  const die = dice[at];
  dice.splice(at, 1);
  logLine(hero, text('roll.portent', { die }), 'crit');
  recordEvent(hero, 'feature', { item: featureName(hero, 'portent') });
  return die;
}

const lowest = (dice: readonly number[]): number => Math.min(...dice);
const highestDie = (dice: readonly number[]): number => Math.max(...dice);

/** A foe's blow that hit a hero: a diviner near may make it miss with a low enough Portent die. */
function foreseeMiss(hero: Player, attack: AttackProfile, outcome: AttackOutcome): AttackOutcome {
  const seer = diviner(hero);
  if (!seer?.arcana) return outcome;
  const ac = armorClassOf(hero);
  const die = lowest(seer.arcana.portent);
  const instead = resolveAttack(attack, ac, () => die);
  if (instead.hit) return outcome;
  spendPortent(seer, false);
  return instead;
}

/** Illusory Self: a blow that would hit the illusionist strikes their double instead, every 30 seconds. */
function illusoryDouble(hero: Player, outcome: AttackOutcome): AttackOutcome {
  const arcana = hero.arcana;
  if (!outcome.hit || !arcana || arcana.illusoryTicks > 0 || !featureOn(hero, 'illusory_self')) return outcome;
  arcana.illusoryTicks = ILLUSORY_SELF_TICKS;
  logLine(hero, text('roll.illusory_self'), 'hit');
  recordEvent(hero, 'feature', { item: featureName(hero, 'illusory_self') });
  return { ...outcome, hit: false, critical: false, damage: 0 };
}

/** A foe's blow at a hero as the schools change it: a Portent die may turn it, then an illusory double may take it. */
export function turnBlow(hero: Player, attack: AttackProfile, outcome: AttackOutcome): AttackOutcome {
  if (!outcome.hit) return outcome;
  return illusoryDouble(hero, foreseeMiss(hero, attack, outcome));
}

/** Another live foe touching the attacker (Instinctive Charm turns the blow on it), if any. */
function foeBeside(foe: Entity): Entity | undefined {
  const p = foe.position;
  const r = foe.radius?.x ?? 0;
  if (!p) return undefined;
  for (const other of nearby(p.x, p.y, r + MAX_MOB_RADIUS + CHARM_REDIRECT_REACH, Sense.mob, scratch)) {
    if (other !== foe && isMob(other) && other.health.current > 0) return other;
  }
  return undefined;
}

/**
 * Instinctive Charm: a foe that attacks the enchanter saves (Wisdom) against their spell DC, once a round; on a failure its
 * blow turns on another foe within its reach (or is lost). Returns whether the blow was turned away from the hero.
 */
export function charmedAway(foe: Entity, hero: Player): boolean {
  const arcana = hero.arcana;
  if (!arcana || arcana.charmTicks > 0 || !foe.mobType || !featureOn(hero, 'instinctive_charm')) return false;
  arcana.charmTicks = TURN_TICKS;
  if (wisdomSave(foe, hero)) return false;
  logLine(hero, text('roll.charmed_away'), 'hit');
  const other = foeBeside(foe);
  if (!other || !foe.mobWeapon) return true;
  const outcome = strike(other, monsterAttack(foe.mobType, foe.mobWeapon), foe);
  if (outcome.hit) hitMob(other, foe, outcome.damage);
  return true;
}

/** A foe's saving throw against a spell or feature of the hero's: whether it succeeded (and a Portent die may make it fail). */
export function foreseenSave(foe: Entity, caster: Player, modifier: number, dc: number): { total: number; success: boolean } {
  const save = rollCheck(modifier, dc, spellSaveMode(foe));
  const dice = featureOn(caster, 'portent') ? caster.arcana?.portent : undefined;
  if (!save.success || !dice?.length || modifier + lowest(dice) >= dc) return save;
  const die = spendPortent(caster, false);
  return { total: modifier + die, success: false };
}

/** A foe's Wisdom save against the hero's spell DC, shown over the foe's head. */
function wisdomSave(foe: Entity, hero: Player): boolean {
  const modifier = foe.mobType ? MONSTERS[foe.mobType].modifiers.wisdom : 0;
  const save = foreseenSave(foe, hero, modifier, characterSheet(hero).spell.dc);
  logLine(foe, text(save.success ? 'roll.charm_resisted' : 'roll.charmed', { total: save.total }), save.success ? 'miss' : 'hit');
  return save.success;
}

/** A spell attack of the diviner's that missed: their highest Portent die may make it hit. */
export function foreseeHit(caster: Entity | undefined, target: Entity, attack: AttackProfile, outcome: AttackOutcome): AttackOutcome {
  if (outcome.hit || !isPlayer(caster) || !featureOn(caster, 'portent') || !caster.arcana?.portent.length) return outcome;
  const die = highestDie(caster.arcana.portent);
  const instead = resolveAttack(attack, armorClassOf(target), () => die);
  if (!instead.hit) return outcome;
  spendPortent(caster, true);
  return instead;
}

// ── Spells ────────────────────────────────────────────────────────────────────

const schoolOfSpell = (id: string): string => (isCatalogSpell(id) ? CATALOG[id].school : '');

/** Empowered Evocation: an evoker's Evocation spell adds their Intelligence modifier to its damage. */
export function spellDamageBonus(caster: Player, spell: string): number {
  if (schoolOfSpell(spell) !== 'Evocation' || !featureOn(caster, 'empowered_evocation')) return 0;
  return characterSheet(caster).modifiers.intelligence;
}

/** How far a spell reaches from its caster (its range, or its radius for one that goes off round them), in px. */
function spellReach(spell: string): number {
  return isSpellId(spell) ? Math.max(SPELLS[spell].range, SPELLS[spell].radius) : 0;
}

/** The live foe nearest `foe` (not it) that stands within `reach` of the caster. */
function nextFoe(foe: Entity, caster: Player, reach: number): Entity | undefined {
  const p = foe.position;
  if (!p) return undefined;
  let found: Entity | undefined;
  let best = Infinity;
  const { x, y } = caster.position;
  for (const other of nearby(x, y, reach + MAX_MOB_RADIUS, Sense.mob, scratch)) {
    if (other === foe || !isMob(other) || other.health.current <= 0) continue;
    if (Math.hypot(other.position.x - x, other.position.y - y) > reach + other.radius.x) continue;
    const d = Math.hypot(other.position.x - p.x, other.position.y - p.y);
    if (d >= best) continue;
    best = d;
    found = other;
  }
  return found;
}

/**
 * Split Enchantment: the enchanter's Enchantment spell hurt a foe, so the foe nearest it within the spell's range takes the
 * same damage, once a round (6 s).
 */
export function splitEnchantment(caster: Entity | undefined, foe: Entity, spell: string, damage: number): void {
  if (!isPlayer(caster) || damage <= 0 || schoolOfSpell(spell) !== 'Enchantment') return;
  const arcana = caster.arcana;
  if (!arcana || arcana.splitTicks > 0 || !featureOn(caster, 'split_enchantment')) return;
  const other = nextFoe(foe, caster, spellReach(spell));
  if (!other) return;
  arcana.splitTicks = TURN_TICKS;
  if (other.position) playEffect(CHARM_EFFECT.shape, CHARM_EFFECT.colour, other.position.x, other.position.y, AIM_HEIGHT, CHARM_EFFECT.scale);
  hitMob(other, caster, damage, true);
}

const sculpts = world.with('sculpt', 'position');

/**
 * Sculpt Spells: where an evoker's Evocation spell lands (a burst's middle, the point a bolt struck) a bubble shelters the
 * heroes for a round; a caster keeps one bubble, moved to where their latest such spell landed.
 */
export function sculptAt(caster: Entity | undefined, spell: string, x: number, y: number, radius: number): void {
  if (!isPlayer(caster) || schoolOfSpell(spell) !== 'Evocation' || !featureOn(caster, 'sculpt_spells')) return;
  const owner = world.id(caster) ?? -1;
  const wide = Math.max(SCULPT_MIN_RADIUS, radius);
  let bubble: (typeof sculpts.entities)[number] | undefined;
  for (const s of sculpts) if (s.sculpt.owner === owner) bubble = s;
  if (!bubble) {
    world.add({ position: { x, y }, sculpt: { owner, ticks: SCULPT_TICKS, radius: wide } });
  } else {
    bubble.position.x = x;
    bubble.position.y = y;
    bubble.sculpt.ticks = SCULPT_TICKS;
    bubble.sculpt.radius = wide;
  }
  shimmer(x, y, wide);
}

function shimmer(x: number, y: number, radius: number): void {
  playEffect(SCULPT_EFFECT.shape, SCULPT_EFFECT.colour, x, y, 0, radius / SCULPT_ART_RADIUS);
}

/** The bubbles shimmer now and then, and fade when their round is over. */
function runDownSculpts(): void {
  for (const bubble of sculpts.entities.slice()) {
    const s = bubble.sculpt;
    s.ticks = tick(s.ticks);
    if (s.ticks <= 0) {
      world.remove(bubble);
      continue;
    }
    if (s.ticks % SCULPT_PULSE_TICKS === 0) shimmer(bubble.position.x, bubble.position.y, s.radius);
  }
}

/** Whether the hero stands in a Sculpt Spells bubble: then they succeed on every saving throw. */
export function shelteredBySculpt(hero: Player): boolean {
  for (const bubble of sculpts) {
    if (Math.hypot(hero.position.x - bubble.position.x, hero.position.y - bubble.position.y) <= bubble.sculpt.radius) return true;
  }
  return false;
}

/** What a foe that saved against the hero's spell takes of its damage: half, but nothing from a cantrip without Potent Cantrip. */
export function savedDamage(caster: Player, spellLevel: number, rolled: number): number {
  if (spellLevel === 0 && !featureOn(caster, 'potent_cantrip')) return 0;
  return Math.floor(rolled / 2);
}

/**
 * A spell went off: an Abjuration spell strengthens the Arcane Ward by the level it was cast at, a spell of 1st level or higher
 * foresees a used Portent die again (Expert Divination), and a Transmutation spell of 1st level or higher readies the
 * Transmuter's Stone.
 */
export function spellCast(caster: Player, spell: string, castLevel: number): void {
  if (!schoolOf(caster.build)) return;
  const arcana = arcanaOf(caster);
  const school = schoolOfSpell(spell);
  if (school === 'Abjuration' && featureOn(caster, 'arcane_ward')) arcana.ward = Math.min(wardCap(caster), arcana.ward + castLevel);
  if (castLevel < 1) return;
  // A spell of 1st level or higher during an unimpeded Bladesong gathers a Damage Charge for its Climax.
  if (singingFreely(caster)) arcana.damageCharges = Math.min(songChargeCap(caster), arcana.damageCharges + 1);
  if (featureOn(caster, 'expert_divination') && arcana.portent.length < portentDice(caster)) arcana.portent.push(rollDie(D20));
  if (school === 'Transmutation') readyStones(caster);
}

/** The Transmuter's Stone squares on the quick bar are ready again. */
function readyStones(hero: Player): void {
  const recovery = hero.spellbook?.recovery;
  for (let slot = 0; recovery && slot < recovery.length; slot++) {
    const spell = quickBinding(hero, slot)?.spell ?? '';
    if (spell.startsWith('feature:transmuters_stone')) recovery[slot] = 0;
  }
}

/**
 * Grim Harvest: the necromancer's spell of 1st level or higher killed a foe, so they mend twice the level it was cast at
 * (three times for a Necromancy spell), once a round.
 */
export function grimHarvest(caster: Player, foe: Entity, spell: string, castLevel: number, wasAlive: boolean): void {
  const arcana = caster.arcana;
  if (!wasAlive || (foe.health?.current ?? 1) > 0 || castLevel < 1 || !arcana || arcana.harvestTicks > 0) return;
  if (!featureOn(caster, 'grim_harvest') || !isActivePlayer(caster)) return;
  const factor = schoolOfSpell(spell) === 'Necromancy' ? GRIM_HARVEST_NECROMANCY : GRIM_HARVEST_FACTOR;
  const healed = Math.min(caster.health.max - caster.health.current, factor * castLevel);
  arcana.harvestTicks = TURN_TICKS;
  if (healed <= 0) return;
  caster.health.current += healed;
  logHeal(caster, healed);
  recordEvent(caster, 'regain', { amount: healed, item: featureName(caster, 'grim_harvest') });
}

// ── The schools' active features ──────────────────────────────────────────────

/** What using a school's feature came to: done, or why not. */
export type SchoolResult = 'ok' | 'no_foe' | 'no_room' | 'no_charges' | 'not_singing';

function featureName(hero: Player, id: string): string {
  return featureOfClass(heroClass(hero.heroClass).dndClass, id)?.name ?? id;
}

/** The live foes nearest the hero within `reach` of their body, nearest first, at most `count` (a use, not every tick: it may allocate). */
function foesNear(hero: Player, reach: number, count: number): Entity[] {
  const { x, y } = hero.position;
  const found = nearby(x, y, reach + MAX_MOB_RADIUS, Sense.mob, scratch)
    .filter((foe) => isMob(foe) && !!foe.mobType && foe.health.current > 0 && (foe.status?.charmed ?? 0) <= 0)
    .filter((foe) => Math.hypot((foe.position?.x ?? 0) - x, (foe.position?.y ?? 0) - y) <= reach + (foe.radius?.x ?? 0));
  const dist = (foe: Entity): number => Math.hypot((foe.position?.x ?? 0) - x, (foe.position?.y ?? 0) - y);
  return found.sort((a, b) => dist(a) - dist(b)).slice(0, count);
}

/** A foe fails its Wisdom save against the hero and is charmed for `ticks`. */
function tryCharm(hero: Player, foe: Entity, ticks: number): void {
  if (wisdomSave(foe, hero)) return;
  const by = world.id(hero) ?? -1;
  charm(foe, by, ticks);
  if (foe.position) playEffect(CHARM_EFFECT.shape, CHARM_EFFECT.colour, foe.position.x, foe.position.y, AIM_HEIGHT, CHARM_EFFECT.scale);
}

/** Hypnotic Gaze: the nearest foe saves or stands charmed for 2 rounds. */
function hypnoticGaze(hero: Player): SchoolResult {
  const targets = foesNear(hero, HYPNOTIC_REACH, 1);
  if (!targets.length) return 'no_foe';
  for (const foe of targets) tryCharm(hero, foe, HYPNOTIC_TICKS);
  return 'ok';
}

/** The point aimed at, no further from the hero than `reach`. */
function within(hero: Player, aim: { x: number; y: number }, reach: number): { x: number; y: number } {
  const dx = aim.x - hero.position.x;
  const dy = aim.y - hero.position.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= reach) return { x: aim.x, y: aim.y };
  return { x: hero.position.x + (dx / dist) * reach, y: hero.position.y + (dy / dist) * reach };
}

/**
 * Improved Minor Illusion: an illusory training dummy rises where the wizard aims (the last one fades), and every foe near
 * it that fails its Wisdom save goes for it and strikes it until it is gone (systems/DecoySystem.ts).
 */
function minorIllusion(hero: Player, aim: { x: number; y: number }): SchoolResult {
  const at = within(hero, aim, ILLUSION_RANGE);
  playEffect(ILLUSION_EFFECT.shape, ILLUSION_EFFECT.colour, at.x, at.y, AIM_HEIGHT, ILLUSION_EFFECT.scale);
  const decoy = placeDecoy(hero, at.x, at.y);
  for (const foe of nearby(at.x, at.y, ILLUSION_RADIUS + MAX_MOB_RADIUS, Sense.mob, scratch).slice()) {
    if (!isMob(foe) || !foe.mobType || foe.health.current <= 0) continue;
    if (Math.hypot(foe.position.x - at.x, foe.position.y - at.y) > ILLUSION_RADIUS + foe.radius.x) continue;
    if (!wisdomSave(foe, hero)) lure(foe, decoy);
  }
  return 'ok';
}

/** An ally standing where the wizard aims, within reach, to swap places with. */
function allyAt(hero: Player, at: { x: number; y: number }): Player | undefined {
  for (const ally of q.players) {
    if (ally === hero || !isActivePlayer(ally)) continue;
    const near = Math.hypot(ally.position.x - at.x, ally.position.y - at.y) <= SWAP_REACH + (ally.radius?.x ?? 0);
    if (near && Math.hypot(ally.position.x - hero.position.x, ally.position.y - hero.position.y) <= TELEPORT_REACH) return ally;
  }
  return undefined;
}

/** The farthest place toward the aim (up to 30 feet) the wizard can see and stand on; null if none. */
function landing(level: Level, hero: Player, aim: { x: number; y: number }, canStand: (x: number, y: number) => boolean): { x: number; y: number } | null {
  const at = within(hero, aim, TELEPORT_REACH);
  const dx = at.x - hero.position.x;
  const dy = at.y - hero.position.y;
  const dist = Math.hypot(dx, dy);
  if (dist < TELEPORT_STEP) return null;
  let reached = 0;
  for (let d = TELEPORT_STEP; d <= dist; d += TELEPORT_STEP) {
    if (level.blocksPoint(hero.position.x + (dx / dist) * d, hero.position.y + (dy / dist) * d)) break;
    if (canStand(hero.position.x + (dx / dist) * d, hero.position.y + (dy / dist) * d)) reached = d;
  }
  return reached > 0 ? { x: hero.position.x + (dx / dist) * reached, y: hero.position.y + (dy / dist) * reached } : null;
}

/** Benign Transposition: swap places with an ally aimed at, or step through the air to where the wizard aims. */
function transpose(level: Level, hero: Player, aim: { x: number; y: number }, canStand: (x: number, y: number) => boolean): SchoolResult {
  const from = { x: hero.position.x, y: hero.position.y };
  const ally = allyAt(hero, aim);
  const to = ally ? { x: ally.position.x, y: ally.position.y } : landing(level, hero, aim, canStand);
  if (!to) return 'no_room';
  playEffect(TELEPORT_EFFECT.shape, TELEPORT_EFFECT.colour, from.x, from.y, AIM_HEIGHT, TELEPORT_EFFECT.scale);
  hero.position.x = to.x;
  hero.position.y = to.y;
  if (ally) {
    ally.position.x = from.x;
    ally.position.y = from.y;
  }
  playEffect(TELEPORT_EFFECT.shape, TELEPORT_EFFECT.colour, to.x, to.y, AIM_HEIGHT, TELEPORT_EFFECT.scale);
  return 'ok';
}

/** Bladesong: a charge spent (back only with a long rest or a new depth) for 10 rounds of song (it gives nothing while impeded, and says so). */
function bladesong(hero: Player): SchoolResult {
  const arcana = arcanaOf(hero);
  if (arcana.songCharges <= 0) return 'no_charges';
  arcana.songCharges--;
  arcana.songTicks = BLADESONG_TICKS;
  const id = world.id(hero);
  if (id !== undefined) playAura(BLADESONG_AURA, id, hero.position.x, hero.position.y);
  if (bladesongImpeded(hero.equipped ?? {})) logLine(hero, text('roll.impeded'), 'miss');
  return 'ok';
}

/**
 * Bladesong Climax: the song ends in one burst where the bladesinger aims (up to 30 feet away, 10 feet round). Every foe
 * (or training dummy) there saves (Intelligence) against their spell DC or takes 1d6 force damage and a d6 more for each
 * Damage Charge (half on a success), and the bladesinger and every ally there regain 1d6 hit points and a d6 more for each
 * Healing Charge.
 */
function bladesongClimax(hero: Player, aim: { x: number; y: number }): SchoolResult {
  const arcana = arcanaOf(hero);
  if (!singing(hero)) return 'not_singing';
  const at = within(hero, aim, CLIMAX_RANGE);
  playEffect(CLIMAX_EFFECT.shape, CLIMAX_EFFECT.colour, at.x, at.y, AIM_HEIGHT, CLIMAX_EFFECT.scale);
  recordEvent(hero, 'feature', { item: featureName(hero, 'bladesong_climax') });
  climaxStrikes(hero, at, 1 + arcana.damageCharges);
  climaxHeals(hero, at, 1 + arcana.healingCharges);
  arcana.songTicks = 0;
  arcana.damageCharges = 0;
  arcana.healingCharges = 0;
  return 'ok';
}

/** The Climax's force damage: each foe in reach saves (Intelligence) or takes `dice` d6s, half on a success. */
function climaxStrikes(hero: Player, at: { x: number; y: number }, dice: number): void {
  const dc = characterSheet(hero).spell.dc;
  for (const foe of nearby(at.x, at.y, CLIMAX_RADIUS + MAX_MOB_RADIUS, Sense.mob, scratch)) {
    if (!isTarget(foe) || foe.health.current <= 0) continue;
    if (Math.hypot(foe.position.x - at.x, foe.position.y - at.y) > CLIMAX_RADIUS + foe.radius.x) continue;
    const modifier = foe.mobType ? MONSTERS[foe.mobType].modifiers.intelligence : 0;
    const save = foreseenSave(foe, hero, modifier, dc);
    const rolled = rollDice({ count: dice, sides: CLIMAX_DIE, bonus: 0 });
    const damage = save.success ? Math.floor(rolled / 2) : rolled;
    logSaveDamage(foe, save.total, save.success);
    hitMob(foe, hero, damage, true);
  }
}

/** The Climax's healing: the bladesinger and every ally in reach regain `dice` d6s. */
function climaxHeals(hero: Player, at: { x: number; y: number }, dice: number): void {
  for (const ally of q.players) {
    if (!isActivePlayer(ally)) continue;
    if (ally !== hero && Math.hypot(ally.position.x - at.x, ally.position.y - at.y) > CLIMAX_RADIUS + (ally.radius?.x ?? 0)) continue;
    const healed = Math.min(ally.health.max - ally.health.current, rollDice({ count: dice, sides: CLIMAX_DIE, bonus: 0 }));
    playEffect(CLIMAX_HEAL_EFFECT.shape, CLIMAX_HEAL_EFFECT.colour, ally.position.x, ally.position.y, AIM_HEIGHT, CLIMAX_HEAL_EFFECT.scale);
    if (healed <= 0) continue;
    ally.health.current += healed;
    logHeal(ally, healed);
  }
}

/** Minor Conjuration: Create Water. A puddle where the conjurer aims (up to 30 feet away), for good. */
function createWater(hero: Player, aim: { x: number; y: number }): SchoolResult {
  const at = within(hero, aim, CREATE_WATER_RANGE);
  createPuddle(hero, at.x, at.y, CREATE_WATER_RADIUS);
  playEffect(WATER_EFFECT.shape, WATER_EFFECT.colour, at.x, at.y, 0, WATER_EFFECT.scale);
  return 'ok';
}

/**
 * The Third Eye (darkvision: the fog lifts twice as far round the hero) or the sight of the invisible (the Third Eye, an
 * illusionist's See Invisibility): open until a long rest, death, a fall into a pit or going deeper.
 */
function openSight(hero: Player, sight: 'darkvision' | 'seeInvisible'): SchoolResult {
  arcanaOf(hero)[sight] = true;
  const id = world.id(hero);
  if (id !== undefined) playAura(SIGHT_AURA, id, hero.position.x, hero.position.y);
  return 'ok';
}

/** A Transmuter's Stone: the new one takes the old one's place. */
function makeStone(hero: Player, stone: TransmuterStone): SchoolResult {
  arcanaOf(hero).stone = stone;
  const id = world.id(hero);
  if (id !== undefined) playAura(STONE_AURA, id, hero.position.x, hero.position.y);
  return 'ok';
}

/**
 * The hero uses a school's active feature (null: the id is not one). `aim` is the point aimed at; `canStand` tells where a
 * body can stand (systems/FeatureSystem.ts).
 */
export function useSchoolFeature(
  hero: Player, id: string, level: Level, aim: { x: number; y: number }, canStand: (x: number, y: number) => boolean,
): SchoolResult | null {
  if (id === 'hypnotic_gaze') return hypnoticGaze(hero);
  if (id === 'improved_minor_illusion') return minorIllusion(hero, aim);
  if (id === 'benign_transposition') return transpose(level, hero, aim, canStand);
  if (id === 'bladesong') return bladesong(hero);
  if (id === 'bladesong_climax') return bladesongClimax(hero, aim);
  if (id === 'minor_conjuration') return createWater(hero, aim);
  if (id === 'third_eye_darkvision') return openSight(hero, 'darkvision');
  if (id === 'third_eye_see_invisibility' || id === 'see_invisibility') return openSight(hero, 'seeInvisible');
  if (id === 'transmuters_stone_speed') return makeStone(hero, 'speed');
  if (id === 'transmuters_stone_constitution') return makeStone(hero, 'constitution');
  return null;
}
