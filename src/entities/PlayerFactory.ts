import { world, Team } from '../world';
import type { Entity } from '../world';
import { characterComponents } from '../characters/Characters';
import { createTrail } from '../ai/perception/trail';
import stats from '../data/stats.json';

/** Tuned in src/data/stats.json, next to the enemies' stats. */
const PLAYER_HEALTH = stats.player.health;
/** Players regain one hit point this often while unhurt. */
const PLAYER_REGEN_TICKS = 180;
const PLAYER_SPEED = 1.2;
const PLAYER_FRICTION = 0.4;
/** Half-width of the player's collision box in pixels (two thirds of the original 10). */
const PLAYER_RADIUS = 7;
/** Ticks of sprinting a full stamina bar allows. */
const MAX_SPRINT = 120;

export function createPlayer(x: number, y: number): Entity {
  return world.add({
    position: { x, y },
    velocity: { x: 0, y: 0 },
    radius: { x: PLAYER_RADIUS, y: PLAYER_RADIUS },
    blocking: true,
    physicsSlide: true,
    team: Team.Player,
    health: { current: PLAYER_HEALTH, max: PLAYER_HEALTH },
    hurtTime: 0,
    freezeTime: 0,
    bounceWallTime: 0,
    regenInterval: PLAYER_REGEN_TICKS,
    regenAmount: 1,
    regenTimer: PLAYER_REGEN_TICKS,
    speed: PLAYER_SPEED,
    friction: PLAYER_FRICTION,
    aimVector: { x: 0, y: 1 },
    walkTime: 0,
    flashTime: 0,
    ...characterComponents('fighter'),
    playerInput: {
      up: false, down: false, left: false, right: false,
      attack: false, use: false, sprint: false,
      mouseX: 0, mouseY: 0,
      mouseAiming: true,
      keyAim: null,
      intents: { use: false, attack: false, cast: false, inventoryOpen: false },
    },
    trail: createTrail(),
    playerStats: {
      level: 1,
      exp: 0,
      gold: 0,
      swordTier: 1,
      armorTier: 0,
      sprinting: false,
      sprint: 0,
      maxSprint: MAX_SPRINT,
      sprintLocked: false,
      kills: 0,
      goldEarned: 0,
    },
    inventory: [],
    equipped: {},
    swordCooldown: 0,
    minimapColor: 0x4080ff,
  });
}
