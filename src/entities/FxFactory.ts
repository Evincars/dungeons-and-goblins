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

export type FxOptions = {
  scale?: number;
  /** Row of the sheet to play (effects keep one colour per row). */
  row?: number;
  cycle?: boolean;
  yOffset?: number;
  /** Draw in step with this entity (by id), `orderBias` in front of (+) or behind (−) it. */
  orderId?: number;
  orderBias?: number;
  /** Pixels the effect drifts up each tick. */
  rise?: number;
};

/** A one-off effect playing `frames` frames of a sheet across `duration` ticks, then gone (as in Catacomb Snatch Redux). */
export function spawnFx(x: number, y: number, sheet: string, frames: number, duration: number, opts: FxOptions = {}): Entity {
  return world.add({
    position: { x, y },
    yOffset: opts.yOffset ?? 0,
    visual: { sheet, col: 0, row: opts.row, scale: opts.scale },
    fx: {
      age: 0, duration, frames,
      cycle: opts.cycle, scale: opts.scale, rise: opts.rise, orderId: opts.orderId, orderBias: opts.orderBias,
    },
  });
}

/** Dirt puffs play the ten frames of fx_dirt, each a different size and life, drawn just behind their runner. */
const DIRT_FRAMES = 10;
const DIRT_MIN_LIFE = 14;
const DIRT_LIFE_SPREAD = 14;
const DIRT_MIN_SCALE = 0.7;
const DIRT_SCALE_SPREAD = 0.9;
const DIRT_LIFT = 2;
const BEHIND_OWNER = -0.5;

/** A puff of dark dirt kicked up at a runner's feet, exactly as Catacomb Snatch Redux kicks up its sand. */
export function spawnDust(owner: Entity, x: number, y: number): Entity {
  return spawnFx(x, y, 'fx_dirt', DIRT_FRAMES, DIRT_MIN_LIFE + Math.floor(Math.random() * DIRT_LIFE_SPREAD), {
    scale: DIRT_MIN_SCALE + Math.random() * DIRT_SCALE_SPREAD,
    yOffset: DIRT_LIFT,
    orderId: world.id(owner),
    orderBias: BEHIND_OWNER,
  });
}

/** Spell bursts throw dirt outward: a puff that slides away from the blast as it plays. */
const BURST_MIN_SPEED = 0.3;
const BURST_SPEED_SPREAD = 0.4;
const BURST_MIN_LIFE = 20;
const BURST_LIFE_SPREAD = 10;
const BURST_FRICTION = 0.15;
export function spawnBurstPuff(x: number, y: number): Entity {
  const angle = Math.random() * Math.PI * 2;
  const speed = BURST_MIN_SPEED + Math.random() * BURST_SPEED_SPREAD;
  const puff = spawnFx(x, y, 'fx_dirt', DIRT_FRAMES, BURST_MIN_LIFE + Math.floor(Math.random() * BURST_LIFE_SPREAD), { yOffset: 8 });
  world.addComponent(puff, 'velocity', { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed });
  world.addComponent(puff, 'friction', BURST_FRICTION);
  return puff;
}

/** The "!" over a player who slipped into a pit; it sinks with them (see RenderSystem). */
const EXCLAMATION_GAP = 4;
const EXCLAMATION_HALF_HEIGHT = 7;
const IN_FRONT_OF_OWNER = 0.5;
export function spawnExclamation(owner: Entity, x: number, y: number, headHeight: number, duration: number): Entity {
  return spawnFx(x, y, 'exclamation_mark', 1, duration, {
    yOffset: headHeight + EXCLAMATION_GAP + EXCLAMATION_HALF_HEIGHT,
    orderId: world.id(owner),
    orderBias: IN_FRONT_OF_OWNER,
  });
}
