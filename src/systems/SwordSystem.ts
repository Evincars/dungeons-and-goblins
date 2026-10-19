import { world, Team } from '../world';
import type { Entity } from '../world';
import { sound } from '../audio/SoundPlayer';
import { createSwordSwingFx } from '../entities/FxFactory';

const SWING_TICKS = 8;
const SWING_RANGE_BASE = 28;
const SWORD_COOLDOWN_BASE = 30;

/** Sword damage by tier (0-indexed, tier 1 = index 0). */
const SWORD_DAMAGE = [10, 15, 22, 30];

function swingRange(tier: number): number {
  return SWING_RANGE_BASE + tier * 4;
}

function swingDamage(tier: number): number {
  return SWORD_DAMAGE[Math.min(tier - 1, SWORD_DAMAGE.length - 1)];
}

/** Applies melee hit to a target and shoves them back. */
export function hitMob(mob: Entity, attacker: Entity, damage: number): void {
  const h = mob.health;
  if (!h || h.current <= 0) return;
  if ((mob.freezeTime ?? 0) > 0) return;

  mob.hurtTime = 40;
  mob.freezeTime = 6;
  mob.regenTimer = mob.regenInterval ?? 180;
  h.current = Math.max(0, h.current - damage);

  const ap = attacker.position;
  const mp = mob.position;
  if (ap && mp) {
    const dx = mp.x - ap.x;
    const dy = mp.y - ap.y;
    const dist = Math.hypot(dx, dy) || 1;
    mob.bump ??= { x: 0, y: 0 };
    mob.bump.x = (dx / dist) * 4;
    mob.bump.y = (dy / dist) * 4;
  }

  const pos = mob.position;
  sound.playSound('sword_hit', pos?.x ?? 0, pos?.y ?? 0);
}

export function updateSword(_dt: number): void {
  for (const player of world.with('position', 'playerInput', 'playerStats', 'health')) {
    const pi = player.playerInput!;
    const stats = player.playerStats!;

    // Tick down cooldown
    if (player.swordCooldown! > 0) {
      player.swordCooldown!--;
    }

    // Start a new swing
    if (pi.intents.attack && player.swordCooldown === 0 && player.health!.current > 0 && !player.casting && !player.falling) {
      pi.intents.attack = false;
      const aim = player.aimVector ?? { x: 0, y: 1 };
      const tier = stats.swordTier;
      const damage = swingDamage(tier);
      const range = swingRange(tier);
      world.addComponent(player, 'swordSwing', {
        ticks: SWING_TICKS,
        dirX: aim.x,
        dirY: aim.y,
        damage,
        range,
        hitIds: new Set<number>(),
      });
      player.swordCooldown = SWORD_COOLDOWN_BASE;
      const pos = player.position!;
      createSwordSwingFx(pos.x + aim.x * range * 0.5, pos.y + aim.y * range * 0.5, aim.x, aim.y);
      sound.playSound('sword_swing', pos.x, pos.y);
    }

    // Resolve active swing hitbox
    const swing = player.swordSwing;
    if (!swing) continue;
    swing.ticks--;
    if (swing.ticks <= 0) {
      world.removeComponent(player, 'swordSwing');
      continue;
    }

    const pp = player.position!;
    for (const mob of world.with('position', 'health', 'ai')) {
      if (mob.removed || mob.health!.current <= 0) continue;
      if (mob.team === Team.Player) continue;

      const mobId = world.id(mob);
      if (mobId === undefined) continue;
      if (swing.hitIds.has(mobId)) continue;

      const mp = mob.position!;
      const dx = mp.x - pp.x;
      const dy = mp.y - pp.y;
      const dist = Math.hypot(dx, dy);
      if (dist > swing.range) continue;

      // Arc check: ±60° from swing direction
      const dot = (dx * swing.dirX + dy * swing.dirY) / (dist || 1);
      if (dot < 0.5) continue;

      swing.hitIds.add(mobId);
      hitMob(mob, player, swing.damage);
    }
  }
}
