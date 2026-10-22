import { world, q, isTarget } from '../world';
import type { Entity, Player } from '../world';
import type { Level } from '../level/Level';
import { hitMob } from './SwordSystem';
import { spawnBurstPuff } from '../entities/FxFactory';
import { AIM_HEIGHT, createSpellBolt } from '../entities/ProjectileFactory';
import { playEffect } from '../assets/Effects';
import { SPELL_STATS } from '../entities/WeaponStats';
import { MAX_MOB_RADIUS } from '../entities/MobFactory';
import { sound } from '../audio/SoundPlayer';
import { nearby, Sense } from '../ai/perception/spatial';

const bolts = world.with('projectile', 'position', 'velocity');
/** The glint an arrow leaves where it strikes (from the effects library), and its size. */
const ARROW_HIT_EFFECT = 'x_glint';
const ARROW_HIT_COLOUR = 'white';
const ARROW_HIT_SCALE = 0.5;
type Bolt = (typeof bolts)['entities'][number];

/** Bolts reach this far at most beyond their own position to touch a body. */
const BOLT_QUERY_RADIUS = MAX_MOB_RADIUS + SPELL_STATS.reachY;
const victims: Entity[] = [];

/** Where a projectile ends: a spell bolt bursts in dirt; an arrow glints if it struck something, else just drops. */
function burst(bolt: Bolt, struck: boolean): void {
  const p = bolt.position;
  if (bolt.projectile.arrow) {
    if (struck) playEffect(ARROW_HIT_EFFECT, ARROW_HIT_COLOUR, p.x, p.y, AIM_HEIGHT, ARROW_HIT_SCALE);
  } else {
    for (let i = 0; i < SPELL_STATS.burstPuffs; i++) spawnBurstPuff(p.x, p.y);
  }
  world.addComponent(bolt, 'removed', true);
}

function canCast(caster: Player): boolean {
  return caster.health.current > 0 && caster.respawnTicks === undefined && caster.playerStats.mana >= SPELL_STATS.manaCost
    && !caster.swordSwing && !caster.falling && !(caster.castCooldown ?? 0);
}

/** Mana comes back slowly, a point at a time. */
function regainMana(caster: Player, tick: number): void {
  const stats = caster.playerStats;
  if (stats.mana < stats.maxMana && tick % SPELL_STATS.manaRegenTicks === 0) stats.mana++;
}

/** Starts a cast toward the crosshair, or plays the one under way and lets the bolt fly on its release frame. */
function updateCaster(caster: Player): void {
  if ((caster.castCooldown ?? 0) > 0) caster.castCooldown = (caster.castCooldown ?? 0) - 1;
  const cast = caster.casting;
  if (!cast) {
    if (!caster.playerInput.intents.cast || !canCast(caster)) return;
    const aim = caster.aimVector ?? { x: 0, y: 1 };
    world.addComponent(caster, 'casting', { ticks: 0, dirX: aim.x, dirY: aim.y, released: false });
    caster.castCooldown = SPELL_STATS.cooldown;
    caster.playerStats.mana -= SPELL_STATS.manaCost;
    return;
  }
  cast.ticks++;
  if (!cast.released && cast.ticks >= SPELL_STATS.releaseTick) {
    cast.released = true;
    createSpellBolt(caster.position.x, caster.position.y, cast.dirX, cast.dirY, SPELL_STATS.boltDamage + caster.playerStats.spellBonus);
    sound.playSound('spell', caster.position.x, caster.position.y);
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

function flyBolt(level: Level, bolt: Bolt): void {
  const pos = bolt.position;
  pos.x += bolt.velocity.x;
  pos.y += bolt.velocity.y;
  if (--bolt.projectile.life <= 0 || !level.canPass(pos.x, pos.y)) {
    burst(bolt, false);
    return;
  }
  const victim = boltVictim(bolt);
  if (!victim) return;
  hitMob(victim, bolt, bolt.projectile.damage);
  burst(bolt, true);
}

/** Casting (right mouse / Q) toward the crosshair, and flying spell bolts and arrows. */
export function updateSpells(level: Level, tick: number): void {
  for (const caster of q.players) {
    regainMana(caster, tick);
    updateCaster(caster);
  }
  for (const bolt of bolts) {
    if (!bolt.removed) flyBolt(level, bolt);
  }
}
