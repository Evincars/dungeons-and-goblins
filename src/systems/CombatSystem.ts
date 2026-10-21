import { Rectangle } from 'pixi.js';
import { world, q, isActivePlayer, isMob } from '../world';
import type { Entity, Player } from '../world';
import type { Level } from '../level/Level';
import { boxAround } from '../core/geometry';
import { sound } from '../audio/SoundPlayer';
import { nearby, Sense } from '../ai/perception/spatial';
import { stateDuration, stateImpact } from '../characters/Characters';
import { ATTACK_RECOVERY } from '../characters/StateTriggers';
import { MAX_MOB_RADIUS } from '../entities/MobFactory';

const PLAYER_HURT_TIME = 25;
const PLAYER_FREEZE_TIME = 15;
const PLAYER_KNOCKBACK = 10;
/** Each armour tier takes this share off every hit. */
const ARMOR_PER_TIER = 0.1;
/** Regeneration interval for anything without its own. */
const DEFAULT_REGEN_TICKS = 180;

const living = world.with('health');
const playerBox = new Rectangle();
const mobBox = new Rectangle();
const touching: Entity[] = [];

function tickDown(entity: Entity): void {
  if (entity.hurtTime !== undefined && entity.hurtTime > 0) entity.hurtTime--;
  if (entity.attackTime !== undefined && entity.attackTime > 0) entity.attackTime--;
  if (entity.freezeTime !== undefined && entity.freezeTime > 0) entity.freezeTime--;
  if (entity.bounceWallTime !== undefined && entity.bounceWallTime > 0) entity.bounceWallTime--;
  if (entity.flashTime !== undefined && entity.flashTime > 0) entity.flashTime--;
}

/** Wounds close slowly while nothing hurts the entity. */
function regenerate(entity: Entity & { health: { current: number; max: number } }): void {
  const h = entity.health;
  if ((entity.hurtTime ?? 0) > 0 || h.current >= h.max || entity.regenTimer === undefined) return;
  entity.regenTimer--;
  if (entity.regenTimer > 0) return;
  entity.regenTimer = entity.regenInterval ?? DEFAULT_REGEN_TICKS;
  h.current = Math.min(h.max, h.current + (entity.regenAmount ?? 1));
}

export function updateCombatTimers(): void {
  for (const entity of living) {
    if (entity.respawnTicks !== undefined) continue;
    tickDown(entity);
    regenerate(entity);
  }
}

/** Whether a player can take a hit from touching an enemy right now (never inside a safe room). */
function vulnerable(level: Level, player: Player): boolean {
  if (!isActivePlayer(player) || (player.hurtTime ?? 0) > 0 || !player.radius) return false;
  return !level.isWorldPosSafe(player.position.x, player.position.y);
}

/** The first live enemy whose body overlaps the player's, from the spatial index. */
function enemyTouching(player: Player): Entity | null {
  const r = player.radius;
  if (!r) return null;
  const pb = boxAround(player.position.x, player.position.y, r.x, r.y, playerBox);
  const reach = Math.hypot(r.x + MAX_MOB_RADIUS, r.y + MAX_MOB_RADIUS);
  for (const mob of nearby(player.position.x, player.position.y, reach, Sense.mob, touching)) {
    if (!isMob(mob) || mob.health.current <= 0) continue;
    if (pb.intersects(boxAround(mob.position.x, mob.position.y, mob.radius.x, mob.radius.y, mobBox))) return mob;
  }
  return null;
}

/**
 * A mob in reach starts its swing, and the blow lands when the clip reaches its impact frame, so the
 * damage and the animation coincide. Mobs without an attack clip hit at once.
 */
function strikeLands(mob: Entity): boolean {
  if (!mob.character) return true;
  const swing = stateDuration(mob.character.def, 'attack');
  if (!(mob.attackTime ?? 0)) mob.attackTime = swing + ATTACK_RECOVERY;
  return mob.attackTime === swing + ATTACK_RECOVERY - stateImpact(mob.character.def, 'attack');
}

/** Mobs deal contact damage to the player, except inside safe zones. */
export function updateContactDamage(level: Level): void {
  for (const player of q.players) {
    if (!vulnerable(level, player)) continue;
    const mob = enemyTouching(player);
    if (mob && strikeLands(mob)) hurtPlayer(player, mob, mob.strength ?? 1);
  }
}

function knockBack(player: Entity, source: Entity): void {
  const spos = source.position;
  const ppos = player.position;
  if (!spos || !ppos) return;
  const dx = ppos.x - spos.x;
  const dy = ppos.y - spos.y;
  const dist = Math.hypot(dx, dy) || 1;
  player.bump ??= { x: 0, y: 0 };
  player.bump.x = (dx / dist) * PLAYER_KNOCKBACK;
  player.bump.y = (dy / dist) * PLAYER_KNOCKBACK;
}

export function hurtPlayer(player: Entity, source: Entity, damage: number): void {
  const h = player.health;
  if (!h || player.falling || player.respawnTicks !== undefined || h.current <= 0) return;

  const armorMod = 1.0 - (player.playerStats?.armorTier ?? 0) * ARMOR_PER_TIER;
  const finalDamage = Math.max(1, Math.round(damage * armorMod));

  player.hurtTime = PLAYER_HURT_TIME;
  player.freezeTime = PLAYER_FREEZE_TIME;
  player.regenTimer = player.regenInterval ?? DEFAULT_REGEN_TICKS;
  h.current = Math.max(0, h.current - finalDamage);
  knockBack(player, source);

  if (player.position) sound.playSound('hurt', player.position.x, player.position.y);
}
