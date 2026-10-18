import { world } from '../world';
import type { Entity } from '../world';

export function createDeathFx(x: number, y: number): Entity {
  return world.add({
    position: { x, y },
    yOffset: 16,
    ephemeral: { age: 0, life: 6 * 4, drop: 0 },
    visual: { sheet: 'fx_death' },
    animation: {
      sheet: 'fx_death',
      frameX: 0,
      frameY: 0,
      frameCount: 6,
      frameTime: 4,
      timer: 0,
      loop: false,
    },
  });
}

export function createSwordSwingFx(x: number, y: number, _dirX: number, _dirY: number): Entity {
  return world.add({
    position: { x, y },
    yOffset: 0,
    ephemeral: { age: 0, life: 4 * 4, drop: 0 },
    visual: { sheet: 'fx_sword_swing' },
    animation: {
      sheet: 'fx_sword_swing',
      frameX: 0,
      frameY: 0,
      frameCount: 4,
      frameTime: 4,
      timer: 0,
      loop: false,
    },
  });
}

export function createDustFx(x: number, y: number): Entity {
  const angle = Math.random() * Math.PI * 2;
  const speed = 0.3 + Math.random() * 0.4;
  return world.add({
    position: { x, y },
    velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
    yOffset: 8,
    ephemeral: { age: 0, life: 20 + Math.floor(Math.random() * 10), drop: 0 },
    visual: { sheet: 'fx_dust' },
    animation: {
      sheet: 'fx_dust',
      frameX: 0,
      frameY: 0,
      frameCount: 4,
      frameTime: 5,
      timer: Math.floor(Math.random() * 5),
      loop: true,
    },
    friction: 0.15,
  });
}
