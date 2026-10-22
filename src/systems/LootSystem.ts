import { world, q, isPlayer } from '../world';
import type { Level } from '../level/Level';
import type { Entity, Player } from '../world';
import { sound } from '../audio/SoundPlayer';
import { nearby, Sense } from '../ai/perception/spatial';
import { LOOT_BURST_TICKS, LOOT_REST_LIFT, lootSound } from '../entities/LootFactory';

const LOOT_FRICTION = 0.85;
/** Airborne loot (still bursting out of a kill) barely slows down. */
const AIR_FRICTION = 0.98;
const PICKUP_RADIUS = 16;
const GLIDE_START = 0.6;
const GLIDE_ACCEL = 0.18;
const GLIDE_MAX = 5;
const BLINK_TICKS = 180;
const BLINK_PERIOD = 4;
/** How high a dropped coin arcs on its way out (Redux's burst). */
const BURST_ARC = 12;
/** A coin stops this far short of a wall or anything solid, so it lies on the floor in front of it, never on it. */
const WALL_MARGIN = 4;
/** Speed a coin keeps when it bounces off a wall (reversed). */
const WALL_BOUNCE = 0.3;

type Loot = (typeof q.loot)['entities'][number];

/** The nearest live player found by `nearestPlayer`, and how far away; reused every call. */
type Nearest = { player: Player | null; dist: number };
const near: Nearest = { player: null, dist: Infinity };
const reachable: Entity[] = [];

function nearestPlayer(x: number, y: number, range: number): Nearest {
  near.player = null;
  near.dist = Infinity;
  const candidates = Number.isFinite(range) ? nearby(x, y, range, Sense.player, reachable) : q.players.entities;
  for (const e of candidates) {
    if (!isPlayer(e) || e.health.current <= 0 || e.removed) continue;
    const dist = Math.hypot(e.position.x - x, e.position.y - y);
    if (dist >= range || dist >= near.dist) continue;
    near.player = e;
    near.dist = dist;
  }
  return near;
}

function collect(coin: Loot, player: Player): void {
  const ld = coin.loot;
  player.playerStats.gold += ld.value;
  player.playerStats.goldEarned += ld.value;
  sound.playSound(lootSound(ld.kind), coin.position.x, coin.position.y);
  world.removeComponent(coin, 'loot');
  world.addComponent(coin, 'removed', true);
}

/** Loose loot ages and blinks out; returns false once it has expired. */
function age(coin: Loot): boolean {
  const ld = coin.loot;
  ld.age++;
  const left = ld.life - ld.age;
  if (coin.sprite) coin.sprite.visible = left > BLINK_TICKS || Math.floor(left / BLINK_PERIOD) % 2 === 0;
  if (left > 0) return true;
  world.removeComponent(coin, 'loot');
  world.addComponent(coin, 'removed', true);
  return false;
}

/** Locked-on loot glides ever faster to the nearest player and is collected on arrival. */
function glide(coin: Loot, nearPlayer: Player | null): void {
  const target = nearPlayer ? near : nearestPlayer(coin.position.x, coin.position.y, Infinity);
  const player = target.player;
  if (!player) return;
  if (coin.sprite) coin.sprite.visible = true;
  const ld = coin.loot;
  ld.glide = Math.min(GLIDE_MAX, ld.glide + GLIDE_ACCEL);
  const step = Math.min(ld.glide, target.dist);
  const lp = coin.position;
  lp.x += ((player.position.x - lp.x) / target.dist) * step;
  lp.y += ((player.position.y - lp.y) / target.dist) * step;
  if (target.dist - step <= PICKUP_RADIUS) collect(coin, player);
}

/** Whether a coin at (x, y) would lie on a wall or a solid prop (with a margin, so it stops at the edge). */
function blocked(level: Level, x: number, y: number): boolean {
  return level.getTileAt(x, y - WALL_MARGIN)?.passable === false || level.getTileAt(x, y)?.passable === false;
}

/** A coin flies on, one axis at a time, bouncing off walls instead of landing on top of them. */
function slide(level: Level, coin: Loot): void {
  const lp = coin.position;
  const ld = coin.loot;
  if (blocked(level, lp.x + ld.velX, lp.y)) ld.velX *= -WALL_BOUNCE;
  else lp.x += ld.velX;
  if (blocked(level, lp.x, lp.y + ld.velY)) ld.velY *= -WALL_BOUNCE;
  else lp.y += ld.velY;
}

function updateCoin(level: Level, coin: Loot): void {
  const lp = coin.position;
  const ld = coin.loot;
  const airborne = (ld.burstTicks ?? 0) > 0;
  if (ld.glide === 0) slide(level, coin);
  const friction = airborne ? AIR_FRICTION : LOOT_FRICTION;
  ld.velX *= friction;
  ld.velY *= friction;
  if (airborne) {
    ld.burstTicks = (ld.burstTicks ?? 0) - 1;
    coin.yOffset = LOOT_REST_LIFT + BURST_ARC * Math.sin((Math.PI * ld.burstTicks) / LOOT_BURST_TICKS);
  }

  const nearPlayer = nearestPlayer(lp.x, lp.y, ld.suckRadius).player;
  if (!airborne && nearPlayer && near.dist <= PICKUP_RADIUS) {
    collect(coin, nearPlayer);
    return;
  }
  if (ld.glide <= 0) {
    if (!age(coin) || airborne || !nearPlayer) return;
    ld.glide = GLIDE_START;
  }
  glide(coin, nearPlayer);
}

export function updateLoot(level: Level): void {
  for (const coin of q.loot) {
    if (!coin.removed) updateCoin(level, coin);
  }
}
