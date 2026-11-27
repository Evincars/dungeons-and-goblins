import type { DamageType } from '../rules/DamageTypes';
import { SPELL_VFX } from '../render/SpellVfx';
import { playVfx } from '../render/VfxPlayer';
import { world, q, isActivePlayer, isMob, isPlayer, isTarget, PUDDLE_ART_RADIUS, PUDDLE_FRAMES } from '../world';
import type { Entity, Player } from '../world';
import { text } from '../core/texts';
import { characterSheet, lowestFace, spellcastingFor } from '../rules/CharacterSheet';
import { featureOn } from '../rules/ClassFeatures';
import { CATALOG, castDef, isCatalogSpell } from '../rules/Spellbook';
import { SPELLS } from '../rules/Spells';
import type { SpellDef, SpellId } from '../rules/Spells';
import { MONSTERS } from '../rules/Monsters';
import { MIN_HIT_DAMAGE } from '../rules/Combat';
import { rollDice, rollDie } from '../rules/Dice';
import type { Dice } from '../rules/Dice';
import { nearby, Sense } from '../ai/perception/spatial';
import { MAX_MOB_RADIUS } from '../entities/MobFactory';
import { inArea } from '../rules/SpellArea';
import type { AreaShape, Point } from '../rules/SpellArea';
import { AIM_HEIGHT } from '../entities/ProjectileFactory';
import { playAura, playEffect } from '../assets/Effects';
import type { Aura } from '../assets/Effects';
import { foreseenSave, savedDamage, spellDamageBonus, splitEnchantment } from './SchoolSystem';
import { heroSavingThrow } from './FeatureSystem';
import { hitMob } from './Hits';
import { hurtPlayer } from './CombatSystem';
import { hurtUndead } from './SummonSystem';
import { logLine, logSaveDamage } from './RollLogSystem';
import { recordSpell } from './CombatLogSystem';
import { igniteGrease, spreadSurface } from './Surfaces';
import { endHoldsOf, holdsAnyone } from './SpellHolds';
import { castSeeInvisibility, endInvisibility } from './Invisibility';
import { bladeDice } from '../rules/SpellWeapons';
import { feetToPx } from '../rules/Scale';
import { screenToWorld } from '../render/Camera';
import type { Level } from '../level/Level';

/**
 * Spells that last after they are cast: buffs on the caster (Blade Ward, Shield, Mage Armour, Stoneskin; False Life's
 * temporary hit points), zones that strike whoever stands in them every round (Cloud of Daggers, Cloudkill, Spirit
 * Guardians…), and puddles of water (Create Water) that a thunder or lightning spell charges with lightning. A spell held by
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
const NO_BUFFS: Buffs = {
  bladeWard: 0, shield: 0, mageArmor: 0, stoneskin: 0, trueStrike: 0, longstrider: 0, protection: 0, blur: 0, mirrorImage: 0, images: 0,
  shadowBlade: 0, magicWeapon: 0,
};
/** Flaming Sphere rolls 30 feet a round towards where its caster aims (px a tick), and stops this near the aim. */
const SPHERE_SPEED = feetToPx(30) / TURN_TICKS;
const SPHERE_ARRIVE = 2;
/** The sphere's own body: a foe within this (px beyond its own radius) of its middle is rammed. */
const SPHERE_BODY = 12;
/** The sphere sheds light this far (px). */
const SPHERE_LIGHT = 110;
const SPHERE_FLICKER = 0.9;
/** The puddle art (assets/SpriteGen.ts genPuddleSheet). */
const PUDDLE_SHEET = 'puddle';
/** The library's crackle is made for a patch this wide (px of its radius): it is scaled to the puddle. */
const SHOCK_ART_RADIUS = 32;

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

/** A buff without particles of its own: the library's halo round the caster, and its effect. */
function showBuffArt(caster: Player, def: SpellDef, id: number | undefined): void {
  if (id !== undefined) playAura(BUFF_AURA, id, caster.position.x, caster.position.y);
  playEffect(def.effect.shape, def.effect.colour, caster.position.x, caster.position.y, AIM_HEIGHT, def.effect.scale);
}

/** A buff's particles rise round the caster's body from this far above their feet. */
const BODY_MIDDLE = 16;

/**
 * A buff spell takes hold on its caster (one held by concentration ends the last one they held). Mage Armour is switched:
 * cast while it is on, it ends instead. Returns whether the spell took hold (false: it was switched off).
 */
export function castBuff(caster: Player, def: SpellDef): boolean {
  if (def.buff === 'mage_armor' && (caster.buffs?.mageArmor ?? 0) > 0) {
    endMageArmour(caster);
    return false;
  }
  const id = world.id(caster);
  // Its particles round the body where it has them (render/SpellVfx.ts; a lasting aura follows from its buff), else the
  // library's halo and effect.
  const aura = SPELL_VFX[def.id]?.aura;
  if (aura) playVfx(aura, caster.position.x, caster.position.y, BODY_MIDDLE);
  else showBuffArt(caster, def, id);
  if (def.concentration) concentrate(caster, def.id, -1, def.durationTicks);
  const buffs = buffsOf(caster);
  if (def.buff === 'see_invisibility') castSeeInvisibility(caster, def);
  else if (def.buff === 'blur') buffs.blur = def.durationTicks;
  else if (def.buff === 'mirror_image') castMirrorImage(buffs, def);
  else if (def.buff === 'shadow_blade') castShadowBlade(buffs, def);
  else if (def.buff === 'blade_ward') buffs.bladeWard = def.durationTicks;
  else if (def.buff === 'shield') buffs.shield = def.durationTicks;
  else if (def.buff === 'mage_armor') buffs.mageArmor = 1;
  else if (def.buff === 'stoneskin') buffs.stoneskin = def.durationTicks;
  else if (def.buff === 'true_strike') buffs.trueStrike = def.durationTicks;
  else if (def.buff === 'false_life') caster.tempHealth = Math.max(caster.tempHealth ?? 0, rollDice(def.damage));
  return true;
}

/** Mirror Image: its duplicates appear (as many as the spell's count), for its time. */
function castMirrorImage(buffs: Buffs, def: SpellDef): void {
  buffs.mirrorImage = def.durationTicks;
  buffs.images = def.count;
}

/** Shadow Blade: the blade forms in the hand, its dice by the level it was cast at (rules/SpellWeapons.ts). */
function castShadowBlade(buffs: Buffs, def: SpellDef): void {
  buffs.shadowBlade = def.durationTicks;
  buffs.bladeDice = bladeDice(def.level);
}

/** Mage Armour ends (switched off from the quick bar, or body armour put on), and the hero says so. */
export function endMageArmour(hero: Player): void {
  if (!hero.buffs || hero.buffs.mageArmor <= 0) return;
  hero.buffs.mageArmor = 0;
  logLine(hero, text('roll.mage_armor_off'), 'miss');
}

const tick = (ticks: number): number => (ticks > 0 ? ticks - 1 : 0);

/** A hero's buffs run down a tick (those a companion cast on them too). */
function runDownBuffs(hero: Player): void {
  const buffs = hero.buffs;
  if (!buffs) return;
  buffs.bladeWard = tick(buffs.bladeWard);
  buffs.shield = tick(buffs.shield);
  buffs.stoneskin = tick(buffs.stoneskin);
  if (buffs.trueStrike) buffs.trueStrike = tick(buffs.trueStrike);
  if (buffs.longstrider) buffs.longstrider = tick(buffs.longstrider);
  if (buffs.protection) buffs.protection = tick(buffs.protection);
  if (buffs.blur) buffs.blur = tick(buffs.blur);
  if (buffs.mirrorImage) buffs.mirrorImage = tick(buffs.mirrorImage);
  if (buffs.shadowBlade) buffs.shadowBlade = tick(buffs.shadowBlade);
  if (buffs.magicWeapon) buffs.magicWeapon = tick(buffs.magicWeapon);
}

// ── Concentration ─────────────────────────────────────────────────────────────

/**
 * The buff each spell held by concentration keeps going, on whoever it holds (the caster, or the hero it was cast on): it
 * ends with the concentration, and the concentration ends once it is gone (True Strike spent on a blow, Stoneskin run out).
 */
const HELD_BUFFS: Readonly<Partial<Record<SpellId, keyof Buffs>>> = {
  stoneskin: 'stoneskin', true_strike: 'trueStrike', protection_from_evil_and_good: 'protection', blur: 'blur', shadow_blade: 'shadowBlade',
  magic_weapon: 'magicWeapon',
};

/**
 * The hero holds this spell by concentration for up to `ticks` (0: as long as what it holds lasts), with what it made or
 * holds (a zone, Dancing Lights' anchor, a fog cloud, the hero it wards; -1 for none): one spell at a time, so whatever they
 * held before ends.
 */
export function concentrate(hero: Player, spell: SpellId, zone: number, ticks = 0): void {
  endConcentration(hero);
  world.addComponent(hero, 'concentration', { spell, zone, ...(ticks > 0 ? { ticks } : {}) });
}

/** Who a held buff lies on: the hero the spell holds (Protection from Evil and Good cast on a companion), else the caster. */
function holderOf(hero: Player, held: NonNullable<Player['concentration']>): Player {
  const target = held.zone >= 0 ? world.entity(held.zone) : undefined;
  return isPlayer(target) ? target : hero;
}

/**
 * The spell the hero held by concentration ends, and all it keeps going: what it made goes (a zone, Dancing Lights — their
 * wisps follow their anchor out, systems/DancingLights.ts —, a fog cloud) and its buff wears off whoever had it.
 */
export function endConcentration(hero: Player): void {
  const held = hero.concentration;
  if (!held) return;
  world.removeComponent(hero, 'concentration');
  const made = held.zone >= 0 ? world.entity(held.zone) : undefined;
  if (isMade(made) && !made.removed) world.addComponent(made, 'removed', true);
  const buff = HELD_BUFFS[held.spell];
  const holder = holderOf(hero, held);
  if (buff && holder.buffs) holder.buffs[buff] = 0;
  // An invisibility it kept ends; every foe its hex held goes free (systems/SpellHolds.ts).
  if (held.spell === 'invisibility' && made?.invisible) endInvisibility(made);
  endHoldsOf(world.id(hero) ?? -1, held.spell);
}

/** Whether a held spell made the entity (a zone, Dancing Lights, a fog, a gust, webs) rather than holding a body. */
const isMade = (made: Entity | undefined): made is Entity => !!(made?.zone || made?.dancingLights || made?.fogCloud || made?.gust || made?.surface);

/** Whether what a held spell made is gone already (Gust of Wind scattered a fog, fire burnt the webs away). */
function madeGone(held: NonNullable<Player['concentration']>): boolean {
  if (held.zone < 0) return false;
  const made = world.entity(held.zone);
  if (!made) return true;
  return isMade(made) && !!made.removed;
}

/** Whether a held hex holds nobody any more (every foe saved out of it), or a held invisibility has ended. */
function holdsNobody(hero: Player, held: NonNullable<Player['concentration']>): boolean {
  const def = SPELLS[held.spell];
  if (held.spell === 'invisibility') return !world.entity(held.zone)?.invisible;
  return def.condition !== null && def.condition !== 'charmed' && !holdsAnyone(world.id(hero) ?? -1, held.spell);
}

/** Whether the buff a held spell keeps going is gone already (spent, run out, or its holder fell): nothing is left to hold. */
function heldBuffGone(hero: Player, held: NonNullable<Player['concentration']>): boolean {
  const buff = HELD_BUFFS[held.spell];
  if (!buff) return false;
  const holder = holderOf(hero, held);
  return !isActivePlayer(holder) || (holder.buffs?.[buff] ?? 0) <= 0;
}

/** A spell held by concentration a tick on: it ends when its time is up or nothing is left to hold. */
function holdConcentration(hero: Player): void {
  const held = hero.concentration;
  if (!held) return;
  if (held.ticks !== undefined) held.ticks--;
  if ((held.ticks !== undefined && held.ticks <= 0) || heldBuffGone(hero, held) || madeGone(held) || holdsNobody(hero, held)) endConcentration(hero);
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
export function aimedWithin(caster: Player, x: number, y: number, reach: number): { x: number; y: number } {
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
  // Flaming Sphere sheds light where it rolls.
  const light = def.rolls ? { glow: { radius: SPHERE_LIGHT, flicker: SPHERE_FLICKER } } : {};
  const zone = world.add({ position: at, zone: { spell: def.id, owner, castLevel, ticks: def.durationTicks, pulse: 0, follow: def.range <= 0 }, ...light });
  if (def.concentration) concentrate(caster, def.id, world.id(zone) ?? -1, def.durationTicks);
}

type Zone = (typeof q.zones)['entities'][number];

/** A foe in a zone saves (if the spell has a save) or takes the round's damage; a success halves it. */
function zoneStrikes(caster: Player, def: SpellDef, foe: Entity, dc: number): void {
  const rolled = Math.max(MIN_HIT_DAMAGE, rollDice(def.damage, false, rollDie, 0, lowestFace(characterSheet(caster), def.damageType)) + spellDamageBonus(caster, def.id));
  let damage = rolled;
  if (def.save) {
    const modifier = foe.mobType ? MONSTERS[foe.mobType].modifiers[def.save] : 0;
    const save = foreseenSave(foe, caster, modifier, dc);
    if (save.success) damage = savedDamage(caster, def.level, rolled);
    logSaveDamage(foe, save.total, save.success, damage);
    recordSpell(caster, def.id, save.success ? 'saved' : 'auto', damage, save.total);
  } else {
    logLine(foe, text('roll.damage', { amount: damage }), 'damage');
    recordSpell(caster, def.id, 'auto', damage);
  }
  if (damage <= 0) return;
  hitMob(foe, caster, damage, true, def.damageType);
  splitEnchantment(caster, foe, def.id, damage);
}

/** The round's strike of a zone: every live foe whose body is in it. */
function pulseZone(zone: Zone, caster: Player): void {
  const def = castDef(SPELLS[zone.zone.spell], zone.zone.castLevel, caster.playerStats.level);
  const { x, y } = zone.position;
  const dc = spellcastingFor(characterSheet(caster), def.id).dc;
  for (const foe of nearby(x, y, def.radius + MAX_MOB_RADIUS, Sense.mob, scratch)) {
    if (!isTarget(foe) || foe.health.current <= 0) continue;
    if (Math.hypot(foe.position.x - x, foe.position.y - y) > def.radius + Math.max(foe.radius.x, foe.radius.y)) continue;
    zoneStrikes(caster, def, foe, dc);
  }
}

/** Where the caster aims now: their crosshair (this screen's pointer, or the one a guest sent). */
function aimOf(caster: Player): { x: number; y: number } {
  return caster.aimWorld ?? screenToWorld(caster.playerInput.mouseX, caster.playerInput.mouseY, aimScratch);
}
const aimScratch = { x: 0, y: 0 };

/** The first live foe the rolling sphere's body touches, if any. */
function rammed(zone: Zone): Entity | undefined {
  const { x, y } = zone.position;
  for (const foe of nearby(x, y, SPHERE_BODY + MAX_MOB_RADIUS, Sense.mob, scratch)) {
    if (isTarget(foe) && foe.health.current > 0 && Math.hypot(foe.position.x - x, foe.position.y - y) <= SPHERE_BODY + foe.radius.x) return foe;
  }
  return undefined;
}

/**
 * Flaming Sphere rolls towards where its caster aims, 30 feet a round, never into a wall (over a pit it leaps). It sets grease
 * and webs alight on its way, and rams the first foe it runs into: that foe saves against it at once, and the sphere stops
 * there for the rest of the round.
 */
function rollSphere(level: Level, zone: Zone, caster: Player): void {
  const z = zone.zone;
  if ((z.stopped ?? 0) > 0) {
    z.stopped = (z.stopped ?? 0) - 1;
    return;
  }
  const target = aimOf(caster);
  const dx = target.x - zone.position.x;
  const dy = target.y - zone.position.y;
  const d = Math.hypot(dx, dy);
  if (d <= SPHERE_ARRIVE) return;
  const step = Math.min(d, SPHERE_SPEED);
  const nx = zone.position.x + (dx / d) * step;
  const ny = zone.position.y + (dy / d) * step;
  if (level.blocksPoint(nx, ny)) return;
  zone.position.x = nx;
  zone.position.y = ny;
  igniteGrease(nx, ny, SPHERE_BODY, z.owner);
  const foe = rammed(zone);
  if (!foe) return;
  const def = castDef(SPELLS[z.spell], z.castLevel, caster.playerStats.level);
  zoneStrikes(caster, def, foe, spellcastingFor(characterSheet(caster), def.id).dc);
  z.stopped = Math.max(1, z.pulse);
}

/** A zone follows its caster if it should, shows itself, strikes every round, and goes when it ends or its caster falls. */
function updateZone(level: Level | undefined, zone: Zone): void {
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
  if (level && SPELLS[z.spell].rolls) rollSphere(level, zone, caster);
  const art = SPELLS[z.spell].effect;
  // A zone with particles of its own shows in them for as long as it lasts (systems/VfxSystem.ts); any other now and then.
  const shown = SPELL_VFX[z.spell]?.zone !== undefined;
  if (!shown && z.ticks % ZONE_SHOW_TICKS === 0) playEffect(art.shape, art.colour, zone.position.x, zone.position.y, 0, art.scale);
  if (--z.pulse > 0) return;
  z.pulse = TURN_TICKS;
  pulseZone(zone, caster);
}

// ── Grease ────────────────────────────────────────────────────────────────────

/**
 * Grease (or Web's webs) where the caster aims (within the spell's reach), for its duration: difficult terrain that asks a
 * Dexterity save against the caster's spell DC of everyone in it now and whoever steps in (systems/Surfaces.ts). Webs held
 * by concentration go when it ends.
 */
export function castGrease(caster: Player, def: SpellDef, targetX: number, targetY: number): void {
  const at = aimedWithin(caster, targetX, targetY, def.range);
  const dc = spellcastingFor(characterSheet(caster), def.id).dc;
  const patch = spreadSurface(def.surface, at.x, at.y, def.radius, world.id(caster) ?? -1, def.durationTicks, dc);
  const look = SPELL_VFX[def.id]?.burst;
  if (look) playVfx(look, at.x, at.y);
  if (def.concentration) concentrate(caster, def.id, world.id(patch) ?? -1, def.durationTicks);
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

/** The damage that charges water: thunder and lightning. */
const WATER_CHARGERS: ReadonlySet<DamageType> = new Set<DamageType>(['thunder', 'lightning']);

/** Whether a spell of this damage type charges the water it reaches (and the water then conducts it). */
export function chargesWater(type: DamageType): boolean {
  return WATER_CHARGERS.has(type);
}

/** Charges a puddle with lightning, for good: it shocks everyone standing in it at once and every round after. */
function charge(puddle: Puddle): void {
  if (puddle.surface.kind === 'shock') return;
  // Its art follows (systems/SpriteSystem.ts showPuddles).
  puddle.surface.kind = 'shock';
  puddle.surface.pulse = 0;
}

/** A thunder or lightning bolt passed over this point (a circle of 0) or went off over this circle: the puddles it reaches are charged. */
export function electrify(x: number, y: number, radius: number): void {
  for (const puddle of q.surfaces) {
    if (Math.hypot(puddle.position.x - x, puddle.position.y - y) <= radius + puddle.surface.radius) charge(puddle);
  }
}

/** The puddles the last thunder or lightning burst reached (electrifyArea fills it; never reallocated). */
const reached: Puddle[] = [];

/**
 * A thunder or lightning burst cast from `from` went off at `centre` (its own shape: a sphere, a cube, a cone, Lightning
 * Bolt's line): every puddle it reaches is charged, and conducts the spell itself to whoever stands in it (`conducted`).
 * Returns how many it reached.
 */
export function electrifyArea(def: AreaShape, from: Point, centre: Point): number {
  reached.length = 0;
  for (const puddle of q.surfaces) {
    if (!inArea(def, from, centre, puddle.position.x, puddle.position.y, puddle.surface.radius)) continue;
    reached.push(puddle);
    charge(puddle);
  }
  return reached.length;
}

/**
 * Whether a body at (x, y) stands in the water the last burst reached (electrifyArea), so the spell reaches them through it
 * wherever its own area ends: in any of its first `count` puddles (all of them unless asked).
 */
export function conducted(x: number, y: number, count = reached.length): boolean {
  for (let i = 0; i < Math.min(count, reached.length); i++) {
    const puddle = reached[i];
    if (Math.hypot(x - puddle.position.x, y - puddle.position.y) <= puddle.surface.radius) return true;
  }
  return false;
}

/** The puddle the last burst reached at this index (for asking the spatial index who stands in it), or undefined. */
export function reachedPuddle(index: number): Puddle | undefined {
  return reached[index];
}

/** Whether a body stands in the puddle (its feet within the puddle's circle). */
const inPuddle = (puddle: Puddle, body: Entity): boolean =>
  !!body.position && Math.hypot(body.position.x - puddle.position.x, body.position.y - puddle.position.y) <= puddle.surface.radius;

/** Charged water strikes everyone standing in it, once a round: heroes, foes and undead alike, 1d4 lightning. */
function shock(puddle: Puddle): void {
  const maker = world.entity(puddle.surface.owner);
  const { x, y } = puddle.position;
  playEffect(SHOCK_EFFECT.shape, SHOCK_EFFECT.colour, x, y, 0, SHOCK_EFFECT.scale * puddle.surface.radius / SHOCK_ART_RADIUS);
  for (const hero of q.players) if (isActivePlayer(hero) && inPuddle(puddle, hero)) hurtPlayer(hero, puddle, rollDice(SHOCK_DAMAGE), 'lightning');
  for (const undead of q.summons) if (inPuddle(puddle, undead)) hurtUndead(undead, rollDice(SHOCK_DAMAGE));
  for (const foe of nearby(x, y, puddle.surface.radius + MAX_MOB_RADIUS, Sense.mob, scratch)) {
    if (isMob(foe) && foe.health.current > 0 && inPuddle(puddle, foe)) hitMob(foe, maker ?? puddle, rollDice(SHOCK_DAMAGE), true, 'lightning');
  }
}

function updatePuddle(puddle: Puddle): void {
  if (puddle.surface.kind !== 'shock' || --puddle.surface.pulse > 0) return;
  puddle.surface.pulse = TURN_TICKS;
  shock(puddle);
}

// ── Every tick ────────────────────────────────────────────────────────────────

/** Buffs run down, spells held by concentration run out, zones strike and follow, charged water shocks. */
export function updateLastingSpells(level?: Level): void {
  for (const hero of q.players) runDownBuffs(hero);
  for (const hero of q.players) holdConcentration(hero);
  for (const zone of q.zones) if (!zone.removed) updateZone(level, zone);
  for (const puddle of q.surfaces) updatePuddle(puddle);
}

/**
 * What lasts until a long rest ends early: on death, a fall into a pit and going deeper, as at a long rest. Mage Armour
 * wears off, the Third Eye and See Invisibility close, and the spell held by concentration ends.
 */
export function endUntilRest(hero: Player): void {
  if (hero.buffs) Object.assign(hero.buffs, NO_BUFFS);
  if (hero.arcana) hero.arcana.darkvision = hero.arcana.seeInvisible = false;
  if (hero.seesInvisible !== undefined) world.removeComponent(hero, 'seesInvisible');
  if (hero.spellHolds) world.removeComponent(hero, 'spellHolds');
  endConcentration(hero);
}
