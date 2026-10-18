import { world } from '../world';
import type { Entity } from '../world';

const LIFE_BASE = 600;
const BURST_TICKS = 20;

export function createCoin(x: number, y: number, velX: number, velY: number, value: number): Entity {
  const pow = 1 + Math.random();
  return world.add({
    position: { x, y },
    yOffset: 4,
    loot: {
      value,
      kind: value >= 50 ? 'gem' : 'coin',
      velX: velX * pow * 2,
      velY: velY * pow * 2,
      suckRadius: 64,
      glide: 0,
      age: 0,
      life: LIFE_BASE + Math.floor(Math.random() * 100),
      burstTicks: BURST_TICKS,
    },
    radius: { x: 4, y: 4 },
    visual: { sheet: value >= 50 ? 'pickup_gem' : 'pickup_coin_16', col: 0 },
    animation: {
      sheet: value >= 50 ? 'pickup_gem' : 'pickup_coin_16',
      frameX: Math.floor(Math.random() * 4),
      frameY: 0,
      frameCount: 4,
      frameTime: 4,
      timer: 0,
      loop: true,
    },
  });
}

export function dropLoot(x: number, y: number, value: number): void {
  const count = Math.min(4, Math.max(1, Math.floor(value / 10)));
  const perCoin = Math.ceil(value / count);
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
    const speed = 0.4 + Math.random() * 0.8;
    createCoin(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, Math.min(perCoin, value - i * perCoin));
  }
}

export function createPotion(x: number, y: number, velX: number, velY: number): Entity {
  const pow = 1 + Math.random();
  return world.add({
    position: { x, y },
    yOffset: 8,
    loot: {
      value: 30,
      kind: 'potion',
      velX: velX * pow * 1.5,
      velY: velY * pow * 1.5,
      suckRadius: 48,
      glide: 0,
      age: 0,
      life: LIFE_BASE,
      burstTicks: BURST_TICKS,
    },
    radius: { x: 5, y: 5 },
    visual: { sheet: 'pickup_potion', col: 0 },
  });
}
