import { world, Team, Facing } from '../world';
import type { Entity } from '../world';
import type { Level } from '../level/Level';

export type MobType = 'goblin' | 'skeleton' | 'orc' | 'troll';

type MobConfig = {
  health: number;
  speed: number;
  strength: number;
  deathPoints: number;
  limp: number;
  radius: { x: number; y: number };
  sheet: string;
  frameCount: number;
  yOffset: number;
};

const MOB_CONFIGS: Record<MobType, MobConfig> = {
  goblin: {
    health: 14, speed: 0.7, strength: 3, deathPoints: 5, limp: 4,
    radius: { x: 8, y: 8 }, sheet: 'enemy_goblin_32', frameCount: 4, yOffset: 8,
  },
  skeleton: {
    health: 18, speed: 0.6, strength: 4, deathPoints: 8, limp: 3,
    radius: { x: 8, y: 8 }, sheet: 'enemy_skeleton_32', frameCount: 4, yOffset: 8,
  },
  orc: {
    health: 30, speed: 0.5, strength: 6, deathPoints: 12, limp: 3,
    radius: { x: 10, y: 10 }, sheet: 'enemy_orc_32', frameCount: 4, yOffset: 8,
  },
  troll: {
    health: 120, speed: 0.4, strength: 12, deathPoints: 50, limp: 2,
    radius: { x: 16, y: 14 }, sheet: 'enemy_troll_48', frameCount: 4, yOffset: 16,
  },
};

export function mobRadius(type: string): { x: number; y: number } {
  return (MOB_CONFIGS[type as MobType] ?? MOB_CONFIGS.goblin).radius;
}

export function createMob(_level: Level, type: string, x: number, y: number): Entity {
  const cfg = MOB_CONFIGS[type as MobType] ?? MOB_CONFIGS.goblin;

  return world.add({
    position: { x, y },
    velocity: { x: 0, y: 0 },
    radius: { ...cfg.radius },
    blocking: true,
    physicsSlide: true,
    team: Team.Neutral,
    mobType: type,
    health: { current: cfg.health, max: cfg.health },
    healthBarOffset: cfg.yOffset + 4,
    hurtTime: 0,
    freezeTime: 0,
    bounceWallTime: 0,
    regenInterval: 300,
    regenAmount: 1,
    regenTimer: 300,
    deathPoints: cfg.deathPoints,
    strength: cfg.strength,
    speed: cfg.speed,
    friction: 0.2,
    facing: Facing.South,
    aimVector: { x: 0, y: 1 },
    walkTime: 0,
    limp: cfg.limp,
    yOffset: cfg.yOffset,
    bump: { x: 0, y: 0 },
    chasing: false,
    ai: { type: 'wander' },
    visual: { sheet: cfg.sheet },
    animation: {
      sheet: cfg.sheet,
      frameX: 0,
      frameY: 0,
      frameCount: cfg.frameCount,
      frameTime: 8,
      timer: 0,
      loop: true,
    },
    minimapColor: type === 'troll' ? 0xff8000 : 0xff4040,
  });
}
