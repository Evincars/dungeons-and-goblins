import { world } from '../world';
import type { Entity } from '../world';
import { BB } from '../math/BB';
import { sound } from '../audio/SoundPlayer';

const PLAYER_HURT_TIME = 25;
const PLAYER_FREEZE_TIME = 15;
const PLAYER_KNOCKBACK = 10;

export function updateCombatTimers(_dt: number): void {
  for (const entity of world.with('health')) {
    if (entity.respawnTicks !== undefined) continue;
    if (entity.hurtTime !== undefined && entity.hurtTime > 0) entity.hurtTime--;
    if (entity.freezeTime !== undefined && entity.freezeTime > 0) entity.freezeTime--;
    if (entity.bounceWallTime !== undefined && entity.bounceWallTime > 0) entity.bounceWallTime--;
    if (entity.flashTime !== undefined && entity.flashTime > 0) entity.flashTime--;

    const h = entity.health;
    if (!h) continue;
    if ((entity.hurtTime ?? 0) <= 0 && h.current < h.max) {
      if (entity.regenTimer !== undefined) {
        entity.regenTimer--;
        if (entity.regenTimer <= 0) {
          entity.regenTimer = entity.regenInterval ?? 180;
          h.current = Math.min(h.max, h.current + (entity.regenAmount ?? 1));
        }
      }
    }
  }
}

/** Mobs deal contact damage to the player. */
export function updateContactDamage(_dt: number): void {
  const mobs = world.with('position', 'radius', 'ai', 'health');
  const players = world.with('position', 'radius', 'playerInput', 'health');

  for (const mob of mobs) {
    if (mob.health!.current <= 0) continue;
    const mpos = mob.position!;
    const mrad = mob.radius!;
    const mbb = BB.fromCenter(mpos.x, mpos.y, mrad.x, mrad.y);

    for (const player of players) {
      if (player.health!.current <= 0) continue;
      if ((player.hurtTime ?? 0) > 0) continue;
      const ppos = player.position!;
      const prad = player.radius!;
      if (!mbb.intersects(BB.fromCenter(ppos.x, ppos.y, prad.x, prad.y))) continue;
      hurtPlayer(player, mob, mob.strength ?? 1);
    }
  }
}

export function hurtPlayer(player: Entity, source: Entity, damage: number): void {
  const h = player.health;
  if (!h || player.respawnTicks !== undefined || h.current <= 0) return;

  const armorMod = 1.0 - (player.playerStats?.armorTier ?? 0) * 0.1;
  const finalDamage = Math.max(1, Math.round(damage * armorMod));

  player.hurtTime = PLAYER_HURT_TIME;
  player.freezeTime = PLAYER_FREEZE_TIME;
  player.regenTimer = player.regenInterval ?? 180;
  h.current = Math.max(0, h.current - finalDamage);

  const spos = source.position;
  const ppos = player.position;
  if (spos && ppos) {
    const dx = ppos.x - spos.x;
    const dy = ppos.y - spos.y;
    const dist = Math.hypot(dx, dy) || 1;
    player.bump ??= { x: 0, y: 0 };
    player.bump.x = (dx / dist) * PLAYER_KNOCKBACK;
    player.bump.y = (dy / dist) * PLAYER_KNOCKBACK;
  }

  if (ppos) sound.playSound('hurt', ppos.x, ppos.y);
}
