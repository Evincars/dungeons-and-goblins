import { world, q, isPlayer } from '../world';
import type { Entity, Player } from '../world';
import { sound } from '../audio/SoundPlayer';
import { nearby, Sense } from '../ai/perception/spatial';

const LOOT_FRICTION = 0.85;
/** Airborne loot (still bursting out of a kill) barely slows down. */
const AIR_FRICTION = 0.98;
const PICKUP_RADIUS = 16;
const GLIDE_START = 0.6;
const GLIDE_ACCEL = 0.18;
const GLIDE_MAX = 5;
const BLINK_TICKS = 180;
const BLINK_PERIOD = 4;
/** Hit points a potion pickup restores. */
const POTION_HEAL = 30;
/** Coins and gems worth at least this much play the bigger pickup sound. */
const BIG_COIN = 20;
const BIG_GEM = 100;

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
  const { x, y } = coin.position;
  if (ld.kind === 'potion') {
    player.health.current = Math.min(player.health.max, player.health.current + POTION_HEAL);
    sound.playSound('potion', x, y);
  } else if (ld.kind === 'gem') {
    player.playerStats.gold += ld.value;
    sound.playSound(ld.value >= BIG_GEM ? 'gem_big' : 'gem', x, y);
  } else {
    player.playerStats.gold += ld.value;
    sound.playSound(ld.value >= BIG_COIN ? 'coin_big' : 'coin', x, y);
  }
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

function updateCoin(coin: Loot): void {
  const lp = coin.position;
  const ld = coin.loot;
  const airborne = (ld.burstTicks ?? 0) > 0;
  if (ld.glide === 0) {
    lp.x += ld.velX;
    lp.y += ld.velY;
  }
  const friction = airborne ? AIR_FRICTION : LOOT_FRICTION;
  ld.velX *= friction;
  ld.velY *= friction;
  if (airborne) ld.burstTicks = (ld.burstTicks ?? 0) - 1;

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

export function updateLoot(): void {
  for (const coin of q.loot) {
    if (!coin.removed) updateCoin(coin);
  }
}
