import { world, Team, Facing } from '../world';
import type { Entity, MobAI, MobType } from '../world';
import type { Level } from '../level/Level';
import { characterComponents, characterDef, groundOffset, headAboveCenter } from '../characters/Characters';
import { ORC } from '../characters/Orc';
import { GOBLIN_GRUNT, GOBLIN_ROGUE, GOBLIN_WARRIOR } from '../characters/Goblins';
import { EVIL_WIZARD, GHOST_WIZARD } from '../characters/Wizards';
import { NEVER_TICK, SENSE_TICKS } from '../ai/constants';
import { MONSTERS, randomMonsterWeapon } from '../rules/Monsters';

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
  deathPoints: number;
  limp: number;
  radius: { x: number; y: number };
  /** Which CharacterDef draws this kind of enemy. */
  character: string;
  /** How far the sprite's centre is lifted above the ground position. */
  yOffset: number;
  scale: number;
  minimapColor: number;
};

/**
 * Hit points and XP reward come from the SRD monster blocks in src/data/stats.json (with Armor Class,
 * abilities and weapons, src/rules/Monsters.ts), so they can be tuned without touching code.
 */
const STATS = MONSTERS satisfies Record<MobType, Pick<MobConfig, 'health' | 'deathPoints'>>;

/** Every enemy stands with its feet on its position, like the player, so none looks sunk into the wall above it. */
export const MOB_CONFIGS = {
  goblin: {
    health: STATS.goblin.health, deathPoints: STATS.goblin.deathPoints, character: ORC.id, speed: 0.7, limp: 4,
    radius: { x: 10, y: 10 }, yOffset: groundOffset(ORC, 1.3), scale: 1.3, minimapColor: 0xff4040,
  },
  skeleton: {
    health: STATS.skeleton.health, deathPoints: STATS.skeleton.deathPoints, character: ORC.id, speed: 0.6, limp: 3,
    radius: { x: 10, y: 10 }, yOffset: groundOffset(ORC, 1.4), scale: 1.4, minimapColor: 0xff4040,
  },
  orc: {
    health: STATS.orc.health, deathPoints: STATS.orc.deathPoints, character: ORC.id, speed: 0.5, limp: 3,
    radius: { x: 12, y: 12 }, yOffset: groundOffset(ORC, 1.6), scale: 1.6, minimapColor: 0xff4040,
  },
  troll: {
    health: STATS.troll.health, deathPoints: STATS.troll.deathPoints, character: ORC.id, speed: 0.4, limp: 2,
    radius: { x: 16, y: 14 }, yOffset: groundOffset(ORC, 2.0), scale: 2.0, minimapColor: 0xff8000,
  },
  goblin_grunt: {
    health: STATS.goblin_grunt.health, deathPoints: STATS.goblin_grunt.deathPoints, character: GOBLIN_GRUNT.id, speed: 0.7, limp: 4,
    radius: { x: 9, y: 9 }, yOffset: groundOffset(GOBLIN_GRUNT), scale: GOBLIN_GRUNT.scale, minimapColor: 0xff4040,
  },
  goblin_rogue: {
    health: STATS.goblin_rogue.health, deathPoints: STATS.goblin_rogue.deathPoints, character: GOBLIN_ROGUE.id, speed: 0.85, limp: 5,
    radius: { x: 9, y: 9 }, yOffset: groundOffset(GOBLIN_ROGUE), scale: GOBLIN_ROGUE.scale, minimapColor: 0xff4040,
  },
  goblin_warrior: {
    health: STATS.goblin_warrior.health, deathPoints: STATS.goblin_warrior.deathPoints, character: GOBLIN_WARRIOR.id, speed: 0.55, limp: 3,
    radius: { x: 11, y: 11 }, yOffset: groundOffset(GOBLIN_WARRIOR), scale: GOBLIN_WARRIOR.scale, minimapColor: 0xff6020,
  },
  ghost_wizard: {
    health: STATS.ghost_wizard.health, deathPoints: STATS.ghost_wizard.deathPoints, character: GHOST_WIZARD.id, speed: 0.75, limp: 0,
    radius: { x: 9, y: 9 }, yOffset: groundOffset(GHOST_WIZARD), scale: GHOST_WIZARD.scale, minimapColor: 0xb040ff,
  },
  evil_wizard: {
    health: STATS.evil_wizard.health, deathPoints: STATS.evil_wizard.deathPoints, character: EVIL_WIZARD.id, speed: 0.5, limp: 3,
    radius: { x: 11, y: 11 }, yOffset: groundOffset(EVIL_WIZARD), scale: EVIL_WIZARD.scale, minimapColor: 0xff2060,
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
    lastSeenTick: NEVER_TICK,
    trailTick: NEVER_TICK,
  };
}

export function createMob(_level: Level, type: MobType, x: number, y: number): Entity {
  const cfg: MobConfig = MOB_CONFIGS[type];
  const def = characterDef(cfg.character);

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
    healthBarOffset: -(cfg.yOffset + headAboveCenter(def, cfg.scale) + HEALTH_BAR_GAP),
    hurtTime: 0,
    freezeTime: 0,
    bounceWallTime: 0,
    regenInterval: MOB_REGEN_TICKS,
    regenAmount: 1,
    regenTimer: MOB_REGEN_TICKS,
    deathPoints: cfg.deathPoints,
    mobWeapon: randomMonsterWeapon(type),
    speed: cfg.speed,
    friction: MOB_FRICTION,
    facing: Facing.South,
    aimVector: { x: 0, y: 1 },
    walkTime: 0,
    limp: cfg.limp,
    bump: { x: 0, y: 0 },
    chasing: false,
    ai: createMobAI(),
    ...characterComponents(cfg.character, cfg.scale),
    // The kind's own scale may differ from the character's, so the lift comes from the table.
    yOffset: cfg.yOffset,
    minimapColor: cfg.minimapColor,
  });
}
