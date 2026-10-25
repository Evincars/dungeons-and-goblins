import { Rectangle } from 'pixi.js';
import { world, q, isActivePlayer, isMob } from '../world';
import type { Entity, Player } from '../world';
import type { Level } from '../level/Level';
import { boxAround } from '../core/geometry';
import { sound } from '../audio/SoundPlayer';
import type { SfxName } from '../audio/SoundPlayer';
import { MOB_CRIES } from '../audio/SoundBank';
import { nearby, Sense } from '../ai/perception/spatial';
import { stateDuration, stateImpact } from '../characters/Characters';
import { ATTACK_RECOVERY } from '../characters/StateTriggers';
import { MAX_MOB_RADIUS } from '../entities/MobFactory';
import { characterSheet, monsterAttack } from '../rules/CharacterSheet';
import { MIN_HIT_DAMAGE } from '../rules/Combat';
import { strike } from './Strike';
import { protectFrom } from './ProtectionSystem';

const PLAYER_HURT_TIME = 25;
const PLAYER_FREEZE_TIME = 15;
const PLAYER_KNOCKBACK = 10;
/** Bodies can no longer overlap, so an enemy this close to the player's body counts as touching it. */
const CONTACT_REACH = 2;

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

/**
 * The combat timers run down. Wounds never close on their own: heroes heal by resting (short and long rests,
 * hit dice) and by spells, and enemies not at all.
 */
export function updateCombatTimers(): void {
  for (const entity of living) {
    if (entity.respawnTicks !== undefined) continue;
    tickDown(entity);
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
  const pb = boxAround(player.position.x, player.position.y, r.x + CONTACT_REACH, r.y + CONTACT_REACH, playerBox);
  const reach = Math.hypot(r.x + MAX_MOB_RADIUS + CONTACT_REACH, r.y + MAX_MOB_RADIUS + CONTACT_REACH);
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
  if (!(mob.attackTime ?? 0)) windUp(mob, swing + ATTACK_RECOVERY);
  return mob.attackTime === swing + ATTACK_RECOVERY - stateImpact(mob.character.def, 'attack');
}

/** The enemy starts its swing, with its battle cry. */
function windUp(mob: Entity, ticks: number): void {
  mob.attackTime = ticks;
  if (mob.mobType && mob.position) sound.playSound(MOB_CRIES[mob.mobType].attack, mob.position.x, mob.position.y);
}

/** A blow the hero's Armor Class turned: caught on their shield if they carry one, parried if not. */
function turnedAside(player: Player): SfxName {
  return characterSheet(player).armorClass.shield > 0 ? 'shield_block' : 'parry';
}

/**
 * The blow lands: the enemy's weapon attack (d20 + proficiency + STR, or DEX for finesse) is rolled against
 * the player's Armor Class, shown over the enemy's head; only a hit hurts.
 */
function mobStrike(mob: Entity, player: Player): void {
  if (!mob.mobType || !mob.mobWeapon) {
    hurtPlayer(player, mob, MIN_HIT_DAMAGE);
    return;
  }
  const attack = monsterAttack(mob.mobType, mob.mobWeapon);
  const outcome = strike(player, protectFrom(player) ? { ...attack, mode: 'disadvantage' } : attack, mob);
  if (outcome.hit) hurtPlayer(player, mob, outcome.damage);
  else sound.playSound(turnedAside(player), player.position.x, player.position.y);
}

/** Enemies strike players they touch, except inside safe zones. */
export function updateContactDamage(level: Level): void {
  for (const player of q.players) {
    if (!vulnerable(level, player)) continue;
    const mob = enemyTouching(player);
    if (mob && strikeLands(mob)) mobStrike(mob, player);
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

/** A blow that got past the player's Armor Class: all of its damage counts (armour already did its job by turning misses). */
export function hurtPlayer(player: Entity, source: Entity, damage: number): void {
  const h = player.health;
  // The console's god mode takes no harm.
  if (!h || player.godMode || player.falling || player.respawnTicks !== undefined || h.current <= 0) return;

  const finalDamage = Math.max(MIN_HIT_DAMAGE, Math.round(damage));

  player.hurtTime = PLAYER_HURT_TIME;
  player.freezeTime = PLAYER_FREEZE_TIME;
  h.current = Math.max(0, h.current - finalDamage);
  knockBack(player, source);

  if (player.position) sound.playSound('hurt', player.position.x, player.position.y);
}
