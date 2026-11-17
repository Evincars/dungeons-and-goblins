import { world, q, isActivePlayer, isMob, isPlayer, isTarget, PUDDLE_FRAMES } from '../world';
import type { Entity, Player } from '../world';
import { text } from '../core/texts';
import { characterSheet } from '../rules/CharacterSheet';
import { featureOn } from '../rules/ClassFeatures';
import { CATALOG, castDef, isCatalogSpell } from '../rules/Spellbook';
import { SPELLS } from '../rules/Spells';
import type { SpellDef, SpellId } from '../rules/Spells';
import { MONSTERS } from '../rules/Monsters';
import { MIN_HIT_DAMAGE } from '../rules/Combat';
import { rollDice } from '../rules/Dice';
import type { Dice } from '../rules/Dice';
import { nearby, Sense } from '../ai/perception/spatial';
import { MAX_MOB_RADIUS } from '../entities/MobFactory';
import { AIM_HEIGHT } from '../entities/ProjectileFactory';
import { playAura, playEffect } from '../assets/Effects';
import type { Aura } from '../assets/Effects';
import { foreseenSave, savedDamage, spellDamageBonus } from './SchoolSystem';
import { heroSavingThrow } from './FeatureSystem';
import { hitMob } from './Hits';
import { hurtPlayer } from './CombatSystem';
import { hurtUndead } from './SummonSystem';
import { logLine, logSave } from './RollLogSystem';
import { recordSpell } from './CombatLogSystem';

/**
 * Spells that last after they are cast: buffs on the caster (Blade Ward, Shield, Mage Armour, Stoneskin; False Life's
 * temporary hit points), zones that strike whoever stands in them every round (Cloud of Daggers, Cloudkill, Spirit
 * Guardians…), and puddles of water (Create Water) that a thunder spell charges with lightning. A spell held by
 * concentration ends when its caster casts another such spell or fails a Constitution save on being hurt (an evoker's
 * Focused Conjuration keeps a Conjuration spell whatever the damage).
 */

type Buffs = NonNullable<Entity['buffs']>;

/** A round of the tabletop game (6 seconds): a zone or charged water strikes once a round. */
const TURN_TICKS = 360;
/** A zone's art plays again this often so it stays in sight between its strikes. */
const ZONE_SHOW_TICKS = 60;
/** A concentration save is against half the damage taken, but never under 10. */
const CONCENTRATION_MIN_DC = 10;
/** Charged water strikes whoever stands in it for 1d4 lightning a round. */
const SHOCK_DAMAGE: Dice = { count: 1, sides: 4, bonus: 0 };
/** Each tick a hero's buffs run down from these. */
const NO_BUFFS: Buffs = { bladeWard: 0, shield: 0, mageArmor: 0, stoneskin: 0 };
/** The puddle art (assets/SpriteGen.ts genPuddleSheet). */
const PUDDLE_SHEET = 'puddle';
/** The puddle art is this wide (px) at scale 1: a puddle of another radius is scaled to fit. */
export const PUDDLE_ART_RADIUS = 32;

const BUFF_AURA: Aura = { shape: 'halo_ring', tint: 0xb8e0ff, ticks: 40, lift: AIM_HEIGHT, scale: 0.9 };
const SHOCK_EFFECT = { shape: 'crackle_ring', colour: 'azure', scale: 1 } as const;
const BROKEN_EFFECT = { shape: 'spark_fragments', colour: 'white', scale: 0.7 } as const;

const scratch: Entity[] = [];

// ── Buffs ─────────────────────────────────────────────────────────────────────

/** The hero's buffs, made the first time one is cast. */
export function buffsOf(hero: Player): Buffs {
  if (hero.buffs) return hero.buffs;
  const buffs = { ...NO_BUFFS };
  world.addComponent(hero, 'buffs', buffs);
  return buffs;
}

/** A buff spell takes hold on its caster (one held by concentration ends the last one they held). */
export function castBuff(caster: Player, def: SpellDef): void {
  const id = world.id(caster);
  if (id !== undefined) playAura(BUFF_AURA, id, caster.position.x, caster.position.y);
  playEffect(def.effect.shape, def.effect.colour, caster.position.x, caster.position.y, AIM_HEIGHT, def.effect.scale);
  if (def.concentration) concentrate(caster, def.id, -1);
  const buffs = buffsOf(caster);
  if (def.buff === 'blade_ward') buffs.bladeWard = def.durationTicks;
  else if (def.buff === 'shield') buffs.shield = def.durationTicks;
  else if (def.buff === 'mage_armor') buffs.mageArmor = 1;
  else if (def.buff === 'stoneskin') buffs.stoneskin = def.durationTicks;
  else if (def.buff === 'false_life') caster.tempHealth = Math.max(caster.tempHealth ?? 0, rollDice(def.damage));
}

const tick = (ticks: number): number => (ticks > 0 ? ticks - 1 : 0);

/** A hero's buffs run down a tick; Stoneskin running out lets go of the concentration on it. */
function runDownBuffs(hero: Player): void {
  const buffs = hero.buffs;
  if (!buffs) return;
  buffs.bladeWard = tick(buffs.bladeWard);
  buffs.shield = tick(buffs.shield);
  buffs.stoneskin = tick(buffs.stoneskin);
  if (buffs.stoneskin === 0 && hero.concentration?.spell === 'stoneskin') world.removeComponent(hero, 'concentration');
}

// ── Concentration ─────────────────────────────────────────────────────────────

/** The hero holds this spell (and its zone, -1 for none) by concentration: whatever they held before ends. */
function concentrate(hero: Player, spell: SpellId, zone: number): void {
  endConcentration(hero);
  world.addComponent(hero, 'concentration', { spell, zone });
}

/** The spell the hero held by concentration ends: its zone goes, Stoneskin wears off. */
export function endConcentration(hero: Player): void {
  const held = hero.concentration;
  if (!held) return;
  const zone = held.zone >= 0 ? world.entity(held.zone) : undefined;
  if (zone?.zone && !zone.removed) world.addComponent(zone, 'removed', true);
  if (held.spell === 'stoneskin' && hero.buffs) hero.buffs.stoneskin = 0;
  world.removeComponent(hero, 'concentration');
}

const schoolOf = (spell: string): string => (isCatalogSpell(spell) ? CATALOG[spell].school : '');

/**
 * The hero was hurt: they keep the spell they concentrate on with a Constitution save against half the damage (at least
 * DC 10), else it ends. An evoker's Focused Conjuration keeps a Conjuration spell without a save.
 */
export function keepConcentration(hero: Player, damage: number): void {
  const held = hero.concentration;
  if (!held || damage <= 0) return;
  if (schoolOf(held.spell) === 'Conjuration' && featureOn(hero, 'focused_conjuration')) return;
  const dc = Math.max(CONCENTRATION_MIN_DC, Math.floor(damage / 2));
  if (heroSavingThrow(hero, 'constitution', dc)) return;
  endConcentration(hero);
  playEffect(BROKEN_EFFECT.shape, BROKEN_EFFECT.colour, hero.position.x, hero.position.y, AIM_HEIGHT, BROKEN_EFFECT.scale);
  logLine(hero, text('roll.concentration_broken', { spell: CATALOG[held.spell]?.name ?? held.spell }), 'miss');
}

// ── Zones ─────────────────────────────────────────────────────────────────────

/** The point aimed at, no further from the caster than `reach` (0: on the caster). */
function aimedWithin(caster: Player, x: number, y: number, reach: number): { x: number; y: number } {
  const dx = x - caster.position.x;
  const dy = y - caster.position.y;
  const dist = Math.hypot(dx, dy);
  if (reach <= 0 || dist === 0) return { x: caster.position.x, y: caster.position.y };
  const along = Math.min(dist, reach);
  return { x: caster.position.x + (dx / dist) * along, y: caster.position.y + (dy / dist) * along };
}

/** A zone is laid where the caster aims (on them, following them, when it has no range) and strikes at once. */
export function castZone(caster: Player, def: SpellDef, castLevel: number, targetX: number, targetY: number): void {
  const at = aimedWithin(caster, targetX, targetY, def.range);
  const owner = world.id(caster) ?? -1;
  const zone = world.add({ position: at, zone: { spell: def.id, owner, castLevel, ticks: def.durationTicks, pulse: 0, follow: def.range <= 0 } });
  if (def.concentration) concentrate(caster, def.id, world.id(zone) ?? -1);
}

type Zone = (typeof q.zones)['entities'][number];

/** A foe in a zone saves (if the spell has a save) or takes the round's damage; a success halves it. */
function zoneStrikes(caster: Player, def: SpellDef, foe: Entity, dc: number): void {
  const rolled = Math.max(MIN_HIT_DAMAGE, rollDice(def.damage) + spellDamageBonus(caster, def.id));
  let damage = rolled;
  if (def.save) {
    const modifier = foe.mobType ? MONSTERS[foe.mobType].modifiers[def.save] : 0;
    const save = foreseenSave(foe, caster, modifier, dc);
    logSave(foe, save.total, save.success);
    if (save.success) damage = savedDamage(caster, def.level, rolled);
    recordSpell(caster, def.id, save.success ? 'saved' : 'auto', damage, save.total);
  } else recordSpell(caster, def.id, 'auto', damage);
  if (damage > 0) hitMob(foe, caster, damage, true);
}

/** The round's strike of a zone: every live foe whose body is in it. */
function pulseZone(zone: Zone, caster: Player): void {
  const def = castDef(SPELLS[zone.zone.spell], zone.zone.castLevel, caster.playerStats.level);
  const { x, y } = zone.position;
  const dc = characterSheet(caster).spell.dc;
  for (const foe of nearby(x, y, def.radius + MAX_MOB_RADIUS, Sense.mob, scratch)) {
    if (!isTarget(foe) || foe.health.current <= 0) continue;
    if (Math.hypot(foe.position.x - x, foe.position.y - y) > def.radius + Math.max(foe.radius.x, foe.radius.y)) continue;
    zoneStrikes(caster, def, foe, dc);
  }
}

/** A zone follows its caster if it should, shows itself, strikes every round, and goes when it ends or its caster falls. */
function updateZone(zone: Zone): void {
  const z = zone.zone;
  const caster = world.entity(z.owner);
  if (!isPlayer(caster) || !isActivePlayer(caster) || z.ticks <= 0) {
    world.addComponent(zone, 'removed', true);
    if (isPlayer(caster) && caster.concentration?.zone === world.id(zone)) world.removeComponent(caster, 'concentration');
    return;
  }
  z.ticks--;
  if (z.follow) {
    zone.position.x = caster.position.x;
    zone.position.y = caster.position.y;
  }
  const art = SPELLS[z.spell].effect;
  if (z.ticks % ZONE_SHOW_TICKS === 0) playEffect(art.shape, art.colour, zone.position.x, zone.position.y, 0, art.scale);
  if (--z.pulse > 0) return;
  z.pulse = TURN_TICKS;
  pulseZone(zone, caster);
}

// ── Water ─────────────────────────────────────────────────────────────────────

/** A puddle of water where the caster aims (within the spell's reach), for good. */
export function castWater(caster: Player, def: SpellDef, targetX: number, targetY: number): void {
  const at = aimedWithin(caster, targetX, targetY, def.range);
  createPuddle(caster, at.x, at.y, def.radius);
  playEffect(def.effect.shape, def.effect.colour, at.x, at.y, 0, def.effect.scale);
}

/** A puddle on the floor: it stays for good, drawn under everyone's feet. */
export function createPuddle(owner: Player, x: number, y: number, radius: number): void {
  world.add({
    position: { x, y }, flat: true, surface: { kind: 'water', radius, owner: world.id(owner) ?? -1, pulse: 0 },
    visual: { sheet: PUDDLE_SHEET, col: PUDDLE_FRAMES.water, scale: radius / PUDDLE_ART_RADIUS },
  });
}

type Puddle = (typeof q.surfaces)['entities'][number];

/** A thunder spell went off over this circle: every puddle it reaches is charged with lightning, for good. */
export function electrify(x: number, y: number, radius: number): void {
  for (const puddle of q.surfaces) {
    if (puddle.surface.kind === 'shock' || Math.hypot(puddle.position.x - x, puddle.position.y - y) > radius + puddle.surface.radius) continue;
    // Its art follows (systems/SpriteSystem.ts showPuddles).
    puddle.surface.kind = 'shock';
    puddle.surface.pulse = 0;
  }
}

/** Whether a body stands in the puddle (its feet within the puddle's circle). */
const inPuddle = (puddle: Puddle, body: Entity): boolean =>
  !!body.position && Math.hypot(body.position.x - puddle.position.x, body.position.y - puddle.position.y) <= puddle.surface.radius;

/** Charged water strikes everyone standing in it, once a round: heroes, foes and undead alike, 1d4 lightning. */
function shock(puddle: Puddle): void {
  const maker = world.entity(puddle.surface.owner);
  const { x, y } = puddle.position;
  playEffect(SHOCK_EFFECT.shape, SHOCK_EFFECT.colour, x, y, 0, SHOCK_EFFECT.scale * puddle.surface.radius / PUDDLE_ART_RADIUS);
  for (const hero of q.players) if (isActivePlayer(hero) && inPuddle(puddle, hero)) hurtPlayer(hero, puddle, rollDice(SHOCK_DAMAGE), 'lightning');
  for (const undead of q.summons) if (inPuddle(puddle, undead)) hurtUndead(undead, rollDice(SHOCK_DAMAGE));
  for (const foe of nearby(x, y, puddle.surface.radius + MAX_MOB_RADIUS, Sense.mob, scratch)) {
    if (isMob(foe) && foe.health.current > 0 && inPuddle(puddle, foe)) hitMob(foe, maker ?? puddle, rollDice(SHOCK_DAMAGE), true);
  }
}

function updatePuddle(puddle: Puddle): void {
  if (puddle.surface.kind !== 'shock' || --puddle.surface.pulse > 0) return;
  puddle.surface.pulse = TURN_TICKS;
  shock(puddle);
}

// ── Every tick ────────────────────────────────────────────────────────────────

/** Buffs run down, zones strike and follow, charged water shocks. */
export function updateLastingSpells(): void {
  for (const hero of q.players) runDownBuffs(hero);
  for (const zone of q.zones) if (!zone.removed) updateZone(zone);
  for (const puddle of q.surfaces) updatePuddle(puddle);
}

/**
 * What lasts until a long rest ends early: on death, a fall into a pit and going deeper, as at a long rest. Mage Armour
 * wears off, the Third Eye and See Invisibility close, and the spell held by concentration ends.
 */
export function endUntilRest(hero: Player): void {
  if (hero.buffs) Object.assign(hero.buffs, NO_BUFFS);
  if (hero.arcana) hero.arcana.darkvision = hero.arcana.seeInvisible = false;
  endConcentration(hero);
}
