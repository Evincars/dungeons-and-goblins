import { world, q, isMob } from '../world';
import type { Entity, Player } from '../world';
import type { Level } from '../level/Level';
import { hitMob } from './SwordSystem';
import { createDustFx } from '../entities/FxFactory';
import { createSpellBolt } from '../entities/ProjectileFactory';
import { SPELL_STATS } from '../entities/WeaponStats';
import { MAX_MOB_RADIUS } from '../entities/MobFactory';
import { sound } from '../audio/SoundPlayer';
import { nearby, Sense } from '../ai/perception/spatial';

const bolts = world.with('projectile', 'position', 'velocity');
type Bolt = (typeof bolts)['entities'][number];

/** Bolts reach this far at most beyond their own position to touch a body. */
const BOLT_QUERY_RADIUS = MAX_MOB_RADIUS + SPELL_STATS.reachY;
const victims: Entity[] = [];

function burst(bolt: Entity): void {
  const p = bolt.position;
  for (let i = 0; p && i < SPELL_STATS.burstPuffs; i++) createDustFx(p.x, p.y);
  world.addComponent(bolt, 'removed', true);
}

function canCast(caster: Player): boolean {
  return caster.health.current > 0 && caster.respawnTicks === undefined
    && !caster.swordSwing && !caster.falling && !(caster.castCooldown ?? 0);
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
    return;
  }
  cast.ticks++;
  if (!cast.released && cast.ticks >= SPELL_STATS.releaseTick) {
    cast.released = true;
    createSpellBolt(caster.position.x, caster.position.y, cast.dirX, cast.dirY);
    sound.playSound('spell', caster.position.x, caster.position.y);
  }
  if (cast.ticks >= SPELL_STATS.castTicks) world.removeComponent(caster, 'casting');
}

/** The first enemy (not of the bolt's team) whose body the bolt touches. */
function boltVictim(bolt: Bolt): Entity | null {
  const pos = bolt.position;
  for (const mob of nearby(pos.x, pos.y, BOLT_QUERY_RADIUS, Sense.mob, victims)) {
    if (!isMob(mob) || mob.health.current <= 0 || mob.team === bolt.projectile.team) continue;
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
    burst(bolt);
    return;
  }
  const victim = boltVictim(bolt);
  if (!victim) return;
  hitMob(victim, bolt, bolt.projectile.damage);
  burst(bolt);
}

/** Casting (right mouse / Q) toward the crosshair, and flying spell bolts. */
export function updateSpells(level: Level): void {
  for (const caster of q.players) updateCaster(caster);
  for (const bolt of bolts) {
    if (!bolt.removed) flyBolt(level, bolt);
  }
}
