import { world, Team } from '../world';
import type { Entity } from '../world';
import type { Level } from '../level/Level';
import { hitMob } from './SwordSystem';
import { AIM_HEIGHT } from './MovementSystem';
import { createDustFx } from '../entities/FxFactory';
import { sound } from '../audio/SoundPlayer';

/** The cast clip is 5 frames × 5 ticks; the bolt leaves the hand on its 4th frame. */
const CAST_TICKS = 25;
const RELEASE_TICK = 15;
const CAST_COOLDOWN = 45;

const BOLT_SPEED = 4.5;
const BOLT_DAMAGE = 14;
const BOLT_LIFE = 80;
/** Bolts travel at hand height above the ground they're tracked on. */
const BOLT_HEIGHT = AIM_HEIGHT;
const BOLT_REACH_X = 6;
const BOLT_REACH_Y = 14;

function spawnBolt(caster: Entity, dx: number, dy: number): void {
  const p = caster.position!;
  world.add({
    position: { x: p.x + dx * 14, y: p.y + dy * 14 },
    velocity: { x: dx * BOLT_SPEED, y: dy * BOLT_SPEED },
    projectile: { damage: BOLT_DAMAGE, life: BOLT_LIFE, team: Team.Player },
    visual: { sheet: 'spell_bolt' },
    yOffset: BOLT_HEIGHT,
    glow: { radius: 56 },
  });
  sound.playSound('spell', p.x, p.y);
}

function burst(bolt: Entity): void {
  const p = bolt.position!;
  for (let i = 0; i < 3; i++) createDustFx(p.x, p.y);
  world.addComponent(bolt, 'removed', true);
}

/** Casting (right mouse / Q) toward the crosshair, and flying spell bolts. */
export function updateSpells(level: Level): void {
  for (const caster of world.with('playerInput', 'position', 'health')) {
    if ((caster.castCooldown ?? 0) > 0) caster.castCooldown!--;
    const pi = caster.playerInput!;

    if (!caster.casting) {
      const able = caster.health!.current > 0 && caster.respawnTicks === undefined
        && !caster.swordSwing && !caster.falling && !(caster.castCooldown ?? 0);
      if (pi.intents.cast && able) {
        const aim = caster.aimVector ?? { x: 0, y: 1 };
        world.addComponent(caster, 'casting', { ticks: 0, dirX: aim.x, dirY: aim.y, released: false });
        caster.castCooldown = CAST_COOLDOWN;
      }
      continue;
    }

    const cast = caster.casting;
    cast.ticks++;
    if (!cast.released && cast.ticks >= RELEASE_TICK) {
      cast.released = true;
      spawnBolt(caster, cast.dirX, cast.dirY);
    }
    if (cast.ticks >= CAST_TICKS) world.removeComponent(caster, 'casting');
  }

  for (const bolt of world.with('projectile', 'position', 'velocity')) {
    if (bolt.removed) continue;
    const pos = bolt.position!;
    pos.x += bolt.velocity!.x;
    pos.y += bolt.velocity!.y;
    const pr = bolt.projectile!;
    if (--pr.life <= 0 || !level.canPass(pos.x, pos.y)) { burst(bolt); continue; }

    for (const mob of world.with('ai', 'position', 'health', 'radius')) {
      if (mob.removed || mob.health!.current <= 0 || mob.team === pr.team) continue;
      const mp = mob.position!;
      const r = mob.radius!;
      if (Math.abs(mp.x - pos.x) > r.x + BOLT_REACH_X || Math.abs(mp.y - pos.y) > r.y + BOLT_REACH_Y) continue;
      hitMob(mob, bolt, pr.damage);
      burst(bolt);
      break;
    }
  }
}
