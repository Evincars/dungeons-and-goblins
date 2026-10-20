import { world, Team, Facing } from '../world';
import type { Entity, MobAI, MobType } from '../world';
import type { Level } from '../level/Level';
import { characterComponents } from '../characters/Characters';
import { SENSE_TICKS } from '../ai/constants';

/** In idle/walk frames the orc's head sits ~8 source px above the centre of its trimmed frame. */
const ORC_HEAD_ABOVE_CENTER = 8;
/** Gap between the top of the head and the health bar. */
const HEALTH_BAR_GAP = 6;
/** Mobs regain one hit point this often while unhurt. */
const MOB_REGEN_TICKS = 300;
const MOB_FRICTION = 0.2;
/** The largest body of any mob, for proximity queries that must catch every one. */
export const MAX_MOB_RADIUS = 16;

export type MobConfig = {
  health: number;
  speed: number;
  strength: number;
  deathPoints: number;
  limp: number;
  radius: { x: number; y: number };
  yOffset: number;
  scale: number;
  minimapColor: number;
};

export const MOB_CONFIGS = {
  goblin: {
    health: 14, speed: 0.7, strength: 3, deathPoints: 5, limp: 4,
    radius: { x: 10, y: 10 }, yOffset: 24, scale: 1.3, minimapColor: 0xff4040,
  },
  skeleton: {
    health: 18, speed: 0.6, strength: 4, deathPoints: 8, limp: 3,
    radius: { x: 10, y: 10 }, yOffset: 24, scale: 1.4, minimapColor: 0xff4040,
  },
  orc: {
    health: 30, speed: 0.5, strength: 6, deathPoints: 12, limp: 3,
    radius: { x: 12, y: 12 }, yOffset: 26, scale: 1.6, minimapColor: 0xff4040,
  },
  troll: {
    health: 120, speed: 0.4, strength: 12, deathPoints: 50, limp: 2,
    radius: { x: 16, y: 14 }, yOffset: 30, scale: 2.0, minimapColor: 0xff8000,
  },
} as const satisfies Record<MobType, MobConfig>;

export function mobRadius(type: MobType): { x: number; y: number } {
  return MOB_CONFIGS[type].radius;
}

/** A fresh enemy brain: idle, with its looks around staggered so a room of enemies doesn't think in lockstep. */
export function createMobAI(): MobAI {
  return {
    state: 'idle',
    role: 'direct',
    route: [],
    step: 0,
    routeGoal: -1,
    repathIn: 0,
    senseIn: 1 + Math.floor(Math.random() * SENSE_TICKS),
    stateTicks: 0,
    calmTicks: 0,
    lastSeenX: 0,
    lastSeenY: 0,
    lastSeenTick: -Infinity,
    trailTick: -Infinity,
  };
}

export function createMob(_level: Level, type: MobType, x: number, y: number): Entity {
  const cfg = MOB_CONFIGS[type];

  return world.add({
    position: { x, y },
    velocity: { x: 0, y: 0 },
    radius: { ...cfg.radius },
    blocking: true,
    physicsSlide: true,
    team: Team.Neutral,
    mobType: type,
    health: { current: cfg.health, max: cfg.health },
    // Above the head: feet → sprite centre (yOffset) → top of the head, plus a small gap.
    healthBarOffset: -Math.round(cfg.yOffset + ORC_HEAD_ABOVE_CENTER * cfg.scale + HEALTH_BAR_GAP),
    hurtTime: 0,
    freezeTime: 0,
    bounceWallTime: 0,
    regenInterval: MOB_REGEN_TICKS,
    regenAmount: 1,
    regenTimer: MOB_REGEN_TICKS,
    deathPoints: cfg.deathPoints,
    strength: cfg.strength,
    speed: cfg.speed,
    friction: MOB_FRICTION,
    facing: Facing.South,
    aimVector: { x: 0, y: 1 },
    walkTime: 0,
    limp: cfg.limp,
    bump: { x: 0, y: 0 },
    chasing: false,
    ai: createMobAI(),
    ...characterComponents('orc', cfg.scale),
    // Hand-tuned per mob type rather than derived from the feet row.
    yOffset: cfg.yOffset,
    minimapColor: cfg.minimapColor,
  });
}
