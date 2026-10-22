import { world, q, Team, isTarget } from '../world';
import type { Entity, Player } from '../world';
import { sound } from '../audio/SoundPlayer';
import { createSwordSwingFx } from '../entities/FxFactory';
import { SWORD_STATS, swingDamage, swingRange } from '../entities/WeaponStats';
import { nearby, Sense } from '../ai/perception/spatial';

/** A mob that takes a hit flinches (can't act) for this long, and shows hurt for this long. */
const MOB_FREEZE_TICKS = 6;
const MOB_HURT_TICKS = 40;
const DEFAULT_REGEN_TICKS = 180;

type Swing = NonNullable<Entity['swordSwing']>;

const struck: Entity[] = [];

/** Applies melee hit to a target and shoves them back. */
export function hitMob(mob: Entity, attacker: Entity, damage: number): void {
  const h = mob.health;
  if (!h || h.current <= 0) return;
  if ((mob.freezeTime ?? 0) > 0) return;

  mob.hurtTime = MOB_HURT_TICKS;
  mob.attackTime = 0;
  mob.freezeTime = MOB_FREEZE_TICKS;
  mob.regenTimer = mob.regenInterval ?? DEFAULT_REGEN_TICKS;
  h.current = Math.max(0, h.current - damage);

  const ap = attacker.position;
  const mp = mob.position;
  if (ap && mp) {
    const dx = mp.x - ap.x;
    const dy = mp.y - ap.y;
    const dist = Math.hypot(dx, dy) || 1;
    mob.bump ??= { x: 0, y: 0 };
    mob.bump.x = (dx / dist) * SWORD_STATS.knockback;
    mob.bump.y = (dy / dist) * SWORD_STATS.knockback;
  }

  sound.playSound('sword_hit', mp?.x ?? 0, mp?.y ?? 0);
}

function canSwing(player: Player): boolean {
  return player.playerInput.intents.attack && player.swordCooldown === 0 && player.health.current > 0
    && !player.casting && !player.falling;
}

function startSwing(player: Player): void {
  player.playerInput.intents.attack = false;
  const aim = player.aimVector ?? { x: 0, y: 1 };
  const range = swingRange(player.playerStats.swordTier);
  world.addComponent(player, 'swordSwing', {
    ticks: SWORD_STATS.swingTicks,
    dirX: aim.x,
    dirY: aim.y,
    damage: swingDamage(player.playerStats.swordTier),
    range,
    hitIds: [],
  });
  player.swordCooldown = SWORD_STATS.cooldown;
  const pos = player.position;
  createSwordSwingFx(pos.x + aim.x * range * 0.5, pos.y + aim.y * range * 0.5, aim.x, aim.y);
  sound.playSound('sword_swing', pos.x, pos.y);
}

/** Whether a mob stands inside the swing's arc and reach, and has not been hit by this swing yet. */
function inArc(player: Player, swing: Swing, mob: Entity, mobId: number): boolean {
  if (!mob.position || swing.hitIds.includes(mobId)) return false;
  const dx = mob.position.x - player.position.x;
  const dy = mob.position.y - player.position.y;
  const dist = Math.hypot(dx, dy);
  if (dist > swing.range) return false;
  return (dx * swing.dirX + dy * swing.dirY) / (dist || 1) >= SWORD_STATS.arcCos;
}

/** Hits every enemy (and the training dummy) inside the live swing's arc, each once per swing. */
function resolveSwing(player: Player, swing: Swing): void {
  for (const mob of nearby(player.position.x, player.position.y, swing.range, Sense.mob, struck)) {
    if (!isTarget(mob) || mob.health.current <= 0 || mob.team === Team.Player) continue;
    const mobId = world.id(mob);
    if (mobId === undefined || !inArc(player, swing, mob, mobId)) continue;
    swing.hitIds.push(mobId);
    hitMob(mob, player, swing.damage);
  }
}

export function updateSword(): void {
  for (const player of q.players) {
    if ((player.swordCooldown ?? 0) > 0) player.swordCooldown = (player.swordCooldown ?? 0) - 1;
    if (canSwing(player)) startSwing(player);

    const swing = player.swordSwing;
    if (!swing) continue;
    if (--swing.ticks <= 0) {
      world.removeComponent(player, 'swordSwing');
      continue;
    }
    resolveSwing(player, swing);
  }
}
