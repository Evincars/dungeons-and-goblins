import { world } from '../world';
import type { Entity } from '../world';
import { sound } from '../audio/SoundPlayer';

const LOOT_FRICTION = 0.85;
const PICKUP_RADIUS = 16;
const GLIDE_START = 0.6;
const GLIDE_ACCEL = 0.18;
const GLIDE_MAX = 5;
const BLINK_TICKS = 180;
const BLINK_PERIOD = 4;

function nearestPlayer(x: number, y: number, range: number): { player: Entity; dist: number } | null {
  let best: { player: Entity; dist: number } | null = null;
  for (const player of world.with('position', 'playerStats', 'health')) {
    if (player.health!.current <= 0 || player.removed) continue;
    const dist = Math.hypot(player.position!.x - x, player.position!.y - y);
    if (dist < range && (!best || dist < best.dist)) best = { player, dist };
  }
  return best;
}

function collect(coin: Entity, player: Entity): void {
  const ld = coin.loot!;
  const stats = player.playerStats!;

  if (ld.kind === 'potion') {
    const h = player.health!;
    h.current = Math.min(h.max, h.current + 30);
    sound.playSound('potion', coin.position!.x, coin.position!.y);
  } else if (ld.kind === 'gem') {
    stats.gold += ld.value;
    sound.playSound(ld.value >= 100 ? 'gem_big' : 'gem', coin.position!.x, coin.position!.y);
  } else {
    stats.gold += ld.value;
    sound.playSound(ld.value >= 20 ? 'coin_big' : 'coin', coin.position!.x, coin.position!.y);
  }

  world.removeComponent(coin, 'loot');
  world.addComponent(coin, 'removed', true);
}

export function updateLoot(_dt: number): void {
  for (const coin of world.with('position', 'loot')) {
    if (coin.removed) continue;
    const lp = coin.position!;
    const ld = coin.loot!;

    const airborne = (ld.burstTicks ?? 0) > 0;
    if (ld.glide === 0) {
      lp.x += ld.velX;
      lp.y += ld.velY;
    }
    ld.velX *= airborne ? 0.98 : LOOT_FRICTION;
    ld.velY *= airborne ? 0.98 : LOOT_FRICTION;
    if (airborne) ld.burstTicks!--;

    const near = nearestPlayer(lp.x, lp.y, ld.suckRadius);
    if (!airborne && near && near.dist <= PICKUP_RADIUS) {
      collect(coin, near.player);
      continue;
    }

    const locked = ld.glide > 0;
    if (!locked) {
      ld.age++;
      const left = ld.life - ld.age;
      if (coin.sprite) coin.sprite.visible = left > BLINK_TICKS || Math.floor(left / BLINK_PERIOD) % 2 === 0;
      if (left <= 0) {
        world.removeComponent(coin, 'loot');
        world.addComponent(coin, 'removed', true);
        continue;
      }
      if (!airborne && near) ld.glide = GLIDE_START;
      else continue;
    }

    const target = near ?? nearestPlayer(lp.x, lp.y, Infinity);
    if (!target) continue;
    if (coin.sprite) coin.sprite.visible = true;

    ld.glide = Math.min(GLIDE_MAX, ld.glide + GLIDE_ACCEL);
    const step = Math.min(ld.glide, target.dist);
    const pp = target.player.position!;
    lp.x += ((pp.x - lp.x) / target.dist) * step;
    lp.y += ((pp.y - lp.y) / target.dist) * step;
    if (target.dist - step <= PICKUP_RADIUS) collect(coin, target.player);
  }
}
