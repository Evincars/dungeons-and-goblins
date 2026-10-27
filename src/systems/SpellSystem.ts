import { world, q, isTarget, QUICK_SLOTS } from '../world';
import type { Entity, Player, SpellEffect } from '../world';
import type { Level } from '../level/Level';
import { hitMob } from './SwordSystem';
import { strike } from './Strike';
import { logHeal, logLine, logSave, logSpellDamage } from './RollLogSystem';
import { recordSpell } from './CombatLogSystem';
import { characterSheet } from '../rules/CharacterSheet';
import type { CharacterSheet } from '../rules/CharacterSheet';
import { heroClass, spellLevelFor } from '../rules/Classes';
import { bindingFeatureId, featureOn, featureOfClass, hasClassFeature } from '../rules/ClassFeatures';
import { usedFeature } from './FeatureSystem';
import { SPELLS, TICKS_PER_SECOND, isSpellId } from '../rules/Spells';
import { castDef, quickBinding } from '../rules/Spellbook';
import type { QuickBinding } from '../rules/Spellbook';
import type { SpellDef } from '../rules/Spells';
import { MONSTERS } from '../rules/Monsters';
import { MIN_HIT_DAMAGE } from '../rules/Combat';
import { diceRange, plus, rollCheck, rollDice } from '../rules/Dice';
import type { Dice } from '../rules/Dice';
import { spawnFx } from '../entities/FxFactory';
import { AIM_HEIGHT, createSpellBolt } from '../entities/ProjectileFactory';
import { playEffect } from '../assets/Effects';
import { SPELL_STATS } from '../entities/WeaponStats';
import { MAX_MOB_RADIUS } from '../entities/MobFactory';
import { sound } from '../audio/SoundPlayer';
import { SPELL_IMPACTS, SPELL_SOUNDS } from '../audio/SoundBank';
import { nearby, Sense } from '../ai/perception/spatial';
import { screenToWorld } from '../render/Camera';
import { text } from '../core/texts';

/**
 * Spells (src/data/spells.json): right click / R casts the one picked on the quick bar (keys 1–5). There are
 * no spell slots — each spell recovers for a while after it is cast. A bolt flies and is rolled to hit; a
 * magic missile's darts always hit; a burst makes everyone in it save against the caster's spell DC (half
 * damage on a success); a heal mends the caster. Each strikes with its effect from the effects library.
 */

const bolts = world.with('projectile', 'position', 'velocity');
/** The glint an arrow leaves where it strikes (from the effects library), and its size. */
const ARROW_HIT_EFFECT = 'x_glint';
const ARROW_HIT_COLOUR = 'white';
const ARROW_HIT_SCALE = 0.5;
type Bolt = (typeof bolts)['entities'][number];

/** Bolts reach this far at most beyond their own position to touch a body. */
const BOLT_QUERY_RADIUS = MAX_MOB_RADIUS + SPELL_STATS.reachY;
/** A magic missile's darts fan out this far apart (radians). */
const MISSILE_SPREAD = 0.22;
/** "Recovering" and "not yet" are said at most this often while the cast key is held. */
const FEEDBACK_TICKS = 30;
const victims: Entity[] = [];
const aimed = { x: 0, y: 0 };

/** Where a projectile ends: the spell's effect (and a caster's own burst art) where it struck; an arrow glints. */
function burst(bolt: Bolt, struck: boolean): void {
  const p = bolt.position;
  const { arrow, burst: art, impact, spell } = bolt.projectile;
  if (arrow && struck) playEffect(ARROW_HIT_EFFECT, ARROW_HIT_COLOUR, p.x, p.y, AIM_HEIGHT, ARROW_HIT_SCALE);
  if (arrow && struck) sound.playSound('arrow_hit', p.x, p.y);
  if (spell) sound.playSound(SPELL_IMPACTS[SPELLS[spell].damageType], p.x, p.y);
  if (art) spawnFx(p.x, p.y, art.sheet, art.count, art.count * art.frameTime, { first: art.first, scale: art.scale, yOffset: AIM_HEIGHT });
  if (impact) playEffect(impact.shape, impact.colour, p.x, p.y, AIM_HEIGHT, impact.scale);
  world.addComponent(bolt, 'removed', true);
}

function canCast(caster: Player): boolean {
  return caster.health.current > 0 && caster.respawnTicks === undefined && !caster.swordSwing && !caster.falling && !(caster.castCooldown ?? 0);
}

/** What the caster bound to the quick-bar square they picked (known or not yet), if the square holds anything. */
function chosenBinding(caster: Player): QuickBinding | null {
  return quickBinding(caster, caster.playerInput.spellSlot);
}

/** Each spell's recovery runs down a tick. */
function recover(caster: Player): void {
  const recovery = caster.spellbook?.recovery;
  if (!recovery) return;
  for (let i = 0; i < recovery.length; i++) if (recovery[i] > 0) recovery[i]--;
}

/** The point aimed at: this screen's pointer for the local player, the crosshair their browser sent for a guest. */
function aimPoint(caster: Player): { x: number; y: number } {
  if (caster.aimWorld) return caster.aimWorld;
  return screenToWorld(caster.playerInput.mouseX, caster.playerInput.mouseY, aimed);
}

/** Why nothing is cast, said over the caster's head (not every tick while the key is held). */
function refuse(caster: Player, line: string): void {
  logLine(caster, line, 'miss');
  sound.playSound('fail', caster.position.x, caster.position.y);
  caster.castCooldown = FEEDBACK_TICKS;
}

/** The cast key on a class feature: it is used at once if the hero has it, it is worked and its square has recovered. */
function startFeature(caster: Player, id: string): void {
  const slot = caster.playerInput.spellSlot;
  const def = featureOfClass(heroClass(caster.heroClass).dndClass, id);
  if (!def || def.kind !== 'active' || !hasClassFeature(caster, id)) {
    refuse(caster, text('roll.no_spell'));
    return;
  }
  const book = caster.spellbook ?? (caster.spellbook = { recovery: Array.from({ length: QUICK_SLOTS }, () => 0) });
  const left = book.recovery[slot] ?? 0;
  if (left > 0) {
    refuse(caster, text('roll.spell_recovering', { seconds: (left / TICKS_PER_SECOND).toFixed(1) }));
    return;
  }
  if (!usedFeature(caster, id, slot)) {
    refuse(caster, text('roll.feature_unworked'));
    return;
  }
  book.recovery[slot] = Math.round(def.cooldown * TICKS_PER_SECOND);
  caster.castCooldown = SPELL_STATS.cooldown;
}

/** The cast key: the spell picked starts (its recovery runs from now), or the caster says why it can't. */
function startCast(caster: Player): void {
  if (!caster.playerInput.intents.cast || !canCast(caster)) return;
  const binding = chosenBinding(caster);
  if (!binding && !heroClass(caster.heroClass).spells.length) return;
  const featureId = binding ? bindingFeatureId(binding.spell) : null;
  if (featureId) {
    startFeature(caster, featureId);
    return;
  }
  // Spells of the wider lists are bound but not worked yet: only those in src/data/spells.json go off.
  const def = binding && isSpellId(binding.spell) ? castDef(SPELLS[binding.spell], binding.level, caster.playerStats.level) : null;
  if (!binding || !def) {
    refuse(caster, text('roll.no_spell'));
    return;
  }
  const learntAt = spellLevelFor(heroClass(caster.heroClass), def.id);
  if (caster.playerStats.level < learntAt) {
    refuse(caster, text('roll.spell_locked', { level: learntAt }));
    return;
  }
  const slot = caster.playerInput.spellSlot;
  const book = caster.spellbook ?? (caster.spellbook = { recovery: Array.from({ length: QUICK_SLOTS }, () => 0) });
  const left = book.recovery[slot] ?? 0;
  if (left > 0) {
    refuse(caster, text('roll.spell_recovering', { seconds: (left / TICKS_PER_SECOND).toFixed(1) }));
    return;
  }
  const aim = caster.aimVector ?? { x: 0, y: 1 };
  const target = aimPoint(caster);
  world.addComponent(caster, 'casting', { ticks: 0, dirX: aim.x, dirY: aim.y, released: false, spell: def.id, level: binding.level, targetX: target.x, targetY: target.y });
  book.recovery[slot] = def.recoveryTicks;
  caster.castCooldown = SPELL_STATS.cooldown;
}

const impactOf = (def: SpellDef): SpellEffect => ({ shape: def.effect.shape, colour: def.effect.colour, scale: def.effect.scale });

/** Eldritch Blast with Agonizing Blast adds the casting ability to its damage; every other bolt rolls its dice. */
function boltDamage(caster: Player, def: SpellDef, sheet: CharacterSheet): Dice {
  const agonizing = def.id === 'eldritch_blast' && featureOn(caster, 'agonizing_blast');
  return agonizing ? plus(def.damage, sheet.modifiers[sheet.spell.ability]) : def.damage;
}

/** A bolt: rolled to hit (d20 + spell attack against AC) when it strikes. */
function castBolt(caster: Player, def: SpellDef, dirX: number, dirY: number): void {
  const sheet = characterSheet(caster);
  const attack = { attackBonus: sheet.spell.attack, damage: boltDamage(caster, def, sheet), mode: sheet.attack.mode };
  createSpellBolt(caster.position.x, caster.position.y, dirX, dirY, attack, world.id(caster), caster.character?.def, { spell: def.id, impact: impactOf(def) });
}

/** Magic missile: its darts fan out round the aim, and each always hits. */
function castMissiles(caster: Player, def: SpellDef, dirX: number, dirY: number): void {
  const sheet = characterSheet(caster);
  const attack = { attackBonus: sheet.spell.attack, damage: def.damage, mode: sheet.attack.mode };
  const base = Math.atan2(dirY, dirX);
  for (let i = 0; i < def.count; i++) {
    const angle = base + (i - (def.count - 1) / 2) * MISSILE_SPREAD;
    createSpellBolt(caster.position.x, caster.position.y, Math.cos(angle), Math.sin(angle), attack, world.id(caster), caster.character?.def,
      { spell: def.id, autoHit: true, impact: impactOf(def) });
  }
}

/** Where a burst goes off: on the caster, or at the point aimed at, no further than the spell reaches. */
function burstCentre(caster: Player, def: SpellDef, targetX: number, targetY: number): { x: number; y: number } {
  const { x, y } = caster.position;
  const dx = targetX - x;
  const dy = targetY - y;
  const dist = Math.hypot(dx, dy);
  if (def.range <= 0 || dist === 0) return { x, y };
  const reach = Math.min(dist, def.range);
  return { x: x + (dx / dist) * reach, y: y + (dy / dist) * reach };
}

/** One foe caught in a burst saves against the spell DC: a failure takes all the damage, a success half. */
function burstHits(caster: Player, def: SpellDef, foe: Entity, dc: number): void {
  const modifier = foe.mobType ? MONSTERS[foe.mobType].modifiers[def.save] : 0;
  const save = rollCheck(modifier, dc);
  const rolled = Math.max(MIN_HIT_DAMAGE, rollDice(def.damage));
  const damage = save.success ? Math.floor(rolled / 2) : rolled;
  logSave(foe, save.total, save.success);
  recordSpell(caster, def.id, save.success ? 'saved' : 'auto', damage, save.total);
  if (damage > 0) hitMob(foe, caster, damage, true);
}

/** A burst: the effect where it goes off, and a save for every foe within its radius. */
function castBurst(caster: Player, def: SpellDef, targetX: number, targetY: number): void {
  const centre = burstCentre(caster, def, targetX, targetY);
  playEffect(def.effect.shape, def.effect.colour, centre.x, centre.y, 0, def.effect.scale);
  // A burst round the caster is all in its casting sound; one thrown further off goes off where it lands.
  if (def.range > 0) sound.playSound(SPELL_IMPACTS[def.damageType], centre.x, centre.y);
  const dc = characterSheet(caster).spell.dc;
  for (const foe of nearby(centre.x, centre.y, def.radius + MAX_MOB_RADIUS, Sense.mob, victims)) {
    if (!isTarget(foe) || foe.health.current <= 0) continue;
    if (Math.hypot(foe.position.x - centre.x, foe.position.y - centre.y) > def.radius + Math.max(foe.radius.x, foe.radius.y)) continue;
    burstHits(caster, def, foe, dc);
  }
}

/** The extra points a Disciple of Life adds to a healing spell: 2 + the spell's level. */
const DISCIPLE_OF_LIFE_BASE = 2;

/** A heal: the dice + the casting ability (+ a Disciple of Life's share), for the caster. */
function castHeal(caster: Player, def: SpellDef): void {
  const sheet = characterSheet(caster);
  const disciple = featureOn(caster, 'disciple_of_life') ? DISCIPLE_OF_LIFE_BASE + def.level : 0;
  // Supreme Healing: every die of a healing spell counts at its highest.
  const rolled = featureOn(caster, 'supreme_healing') ? diceRange(def.damage).max : rollDice(def.damage);
  const amount = Math.max(1, rolled + sheet.modifiers[sheet.spell.ability] + disciple);
  const h = caster.health;
  const healed = Math.min(h.max - h.current, amount);
  h.current += healed;
  playEffect(def.effect.shape, def.effect.colour, caster.position.x, caster.position.y, AIM_HEIGHT, def.effect.scale);
  logHeal(caster, healed);
  recordSpell(caster, def.id, 'heal', healed);
}

/** The cast reaches its release frame: the spell goes off, by its kind. */
function release(caster: Player, cast: NonNullable<Entity['casting']>): void {
  const base = cast.spell ? SPELLS[cast.spell] : null;
  if (!base) return;
  const def = castDef(base, cast.level ?? base.level, caster.playerStats.level);
  if (def.kind === 'bolt') castBolt(caster, def, cast.dirX, cast.dirY);
  else if (def.kind === 'missiles') castMissiles(caster, def, cast.dirX, cast.dirY);
  else if (def.kind === 'burst') castBurst(caster, def, cast.targetX ?? caster.position.x, cast.targetY ?? caster.position.y);
  else castHeal(caster, def);
  sound.playSound(SPELL_SOUNDS[def.id], caster.position.x, caster.position.y);
}

/** Starts a cast toward the crosshair, or plays the one under way and lets it go on its release frame. */
function updateCaster(caster: Player): void {
  if ((caster.castCooldown ?? 0) > 0) caster.castCooldown = (caster.castCooldown ?? 0) - 1;
  recover(caster);
  const cast = caster.casting;
  if (!cast) {
    startCast(caster);
    return;
  }
  cast.ticks++;
  if (!cast.released && cast.ticks >= SPELL_STATS.releaseTick) {
    cast.released = true;
    release(caster, cast);
  }
  if (cast.ticks >= SPELL_STATS.castTicks) world.removeComponent(caster, 'casting');
}

/** The first enemy (not of the bolt's team) whose body the bolt touches. */
function boltVictim(bolt: Bolt): Entity | null {
  const pos = bolt.position;
  for (const mob of nearby(pos.x, pos.y, BOLT_QUERY_RADIUS, Sense.mob, victims)) {
    if (!isTarget(mob) || mob.health.current <= 0 || mob.team === bolt.projectile.team) continue;
    const near = Math.abs(mob.position.x - pos.x) <= mob.radius.x + SPELL_STATS.reachX
      && Math.abs(mob.position.y - pos.y) <= mob.radius.y + SPELL_STATS.reachY;
    if (near) return mob;
  }
  return null;
}

/** A projectile meets a body: a magic missile's dart always hits; anything else is rolled against its AC. */
function strikeWith(bolt: Bolt, victim: Entity): boolean {
  const p = bolt.projectile;
  const shooter = p.owner === undefined ? undefined : world.entity(p.owner);
  if (p.autoHit) {
    const damage = Math.max(MIN_HIT_DAMAGE, rollDice(p.attack.damage));
    if (shooter) logSpellDamage(shooter, damage);
    if (shooter && p.spell) recordSpell(shooter, p.spell, 'auto', damage);
    hitMob(victim, bolt, damage, true);
    return true;
  }
  const outcome = strike(victim, p.attack, shooter, p.spell);
  if (outcome.hit) hitMob(victim, bolt, outcome.damage);
  return outcome.hit;
}

function flyBolt(level: Level, bolt: Bolt): void {
  const pos = bolt.position;
  pos.x += bolt.velocity.x;
  pos.y += bolt.velocity.y;
  if (--bolt.projectile.life <= 0 || level.blocksPoint(pos.x, pos.y)) {
    burst(bolt, false);
    return;
  }
  const victim = boltVictim(bolt);
  if (victim) burst(bolt, strikeWith(bolt, victim));
}

/** Casting (right mouse / R) toward the crosshair, and flying spell bolts and arrows. */
export function updateSpells(level: Level): void {
  for (const caster of q.players) {
    updateCaster(caster);
  }
  for (const bolt of bolts) {
    if (!bolt.removed) flyBolt(level, bolt);
  }
}
