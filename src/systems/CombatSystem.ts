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
import { ATTACK_PERIOD } from '../entities/WeaponStats';
import { strike } from './Strike';
import { protectFrom } from './ProtectionSystem';
import { parried, riposted } from './Reactions';

const PLAYER_HURT_TIME = 25;
const PLAYER_FREEZE_TIME = 15;
const PLAYER_KNOCKBACK = 10;
/** Bodies can no longer overlap, so an enemy this close to the player's body counts as touching it. */
const CONTACT_REACH = 2;

const living = world.with('health');
const playerBox = new Rectangle();
const mobBox = new Rectangle();
const touching: Entity[] = [];
/** Enemies whose swing was looked at this tick, so one touching two heroes swings once. */
const swung = new Set<Entity>();

function tickDown(entity: Entity): void {
  if (entity.hurtTime !== undefined && entity.hurtTime > 0) entity.hurtTime--;
  if (entity.attackTime !== undefined && entity.attackTime > 0) entity.attackTime--;
  if (entity.attackCooldown !== undefined && entity.attackCooldown > 0) entity.attackCooldown--;
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

/**
 * Whether enemies touching a player can strike them right now (never inside a safe room). A hero still reeling from
 * a blow can be struck again: each enemy at them makes its own attacks, as at the table.
 */
function vulnerable(level: Level, player: Player): boolean {
  if (!isActivePlayer(player) || !player.radius) return false;
  return !level.isWorldPosSafe(player.position.x, player.position.y);
}

/** Every live enemy whose body overlaps the player's, from the spatial index (into the shared `touching` list). */
function enemiesTouching(player: Player): readonly Entity[] {
  touching.length = 0;
  const r = player.radius;
  if (!r) return touching;
  const pb = boxAround(player.position.x, player.position.y, r.x + CONTACT_REACH, r.y + CONTACT_REACH, playerBox);
  const reach = Math.hypot(r.x + MAX_MOB_RADIUS + CONTACT_REACH, r.y + MAX_MOB_RADIUS + CONTACT_REACH);
  let kept = 0;
  for (const mob of nearby(player.position.x, player.position.y, reach, Sense.mob, touching)) {
    if (!isMob(mob) || mob.health.current <= 0) continue;
    if (pb.intersects(boxAround(mob.position.x, mob.position.y, mob.radius.x, mob.radius.y, mobBox))) touching[kept++] = mob;
  }
  touching.length = kept;
  return touching;
}

/** An enemy starts an attack: the next may begin a second from now, even if a hit cuts this one short. */
function beginAttack(mob: Entity): void {
  mob.attackCooldown = ATTACK_PERIOD;
}

/**
 * A mob in reach starts its swing (once a second at most), and the blow lands when the clip reaches its impact
 * frame, so the damage and the animation coincide. Mobs without an attack clip hit at once.
 */
function strikeLands(mob: Entity): boolean {
  if (!mob.character) {
    if ((mob.attackCooldown ?? 0) > 0) return false;
    beginAttack(mob);
    return true;
  }
  const swing = stateDuration(mob.character.def, 'attack');
  if (!(mob.attackTime ?? 0)) {
    if ((mob.attackCooldown ?? 0) > 0) return false;
    beginAttack(mob);
    windUp(mob, swing + ATTACK_RECOVERY);
  }
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
  if (outcome.hit) landBlow(player, mob, outcome.damage);
  else missBlow(player, mob);
}

/** The blow got past the Armor Class: a readied Parry may take some of it off. */
function landBlow(player: Player, mob: Entity, damage: number): void {
  const dealt = parried(player, damage);
  if (dealt > 0) hurtPlayer(player, mob, dealt);
  else sound.playSound(turnedAside(player), player.position.x, player.position.y);
}

/** The blow was turned aside: a readied Riposte answers it. */
function missBlow(player: Player, mob: Entity): void {
  sound.playSound(turnedAside(player), player.position.x, player.position.y);
  riposted(player, mob);
}

/**
 * Enemies strike players they touch, except inside safe zones: every one of them in its own time (each winds up
 * and its blow lands on its own impact frame), so none waits behind another that got there first.
 */
export function updateContactDamage(level: Level): void {
  swung.clear();
  for (const player of q.players) {
    if (vulnerable(level, player)) swingAt(player);
  }
}

/** Every enemy touching the player swings (one touching two heroes only once), each blow landing in its own time. */
function swingAt(player: Player): void {
  for (const mob of enemiesTouching(player)) {
    if (swung.has(mob)) continue;
    swung.add(mob);
    if (strikeLands(mob)) mobStrike(mob, player);
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

/**
 * A blow staggers the hero (a short freeze and a shove away from it) unless they are still reeling from the last
 * one, so a crowd of enemies wounds them blow by blow without pinning them in place.
 */
function stagger(player: Entity, source: Entity): void {
  if ((player.hurtTime ?? 0) > 0) return;
  player.hurtTime = PLAYER_HURT_TIME;
  player.freezeTime = PLAYER_FREEZE_TIME;
  knockBack(player, source);
}

/** A blow that got past the player's Armor Class: all of its damage counts (armour already did its job by turning misses). */
export function hurtPlayer(player: Entity, source: Entity, damage: number): void {
  const h = player.health;
  // The console's god mode takes no harm.
  if (!h || player.godMode || player.falling || player.respawnTicks !== undefined || h.current <= 0) return;

  const finalDamage = Math.max(MIN_HIT_DAMAGE, Math.round(damage));
  player.lastHitBy = world.id(source);
  const absorbed = Math.min(player.tempHealth ?? 0, finalDamage);
  if (absorbed > 0) player.tempHealth = (player.tempHealth ?? 0) - absorbed;

  h.current = Math.max(0, h.current - (finalDamage - absorbed));
  stagger(player, source);

  if (player.position) sound.playSound('hurt', player.position.x, player.position.y);
}
