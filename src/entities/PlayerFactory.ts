import { world, Team } from '../world';
import type { Entity } from '../world';
import { characterComponents } from '../characters/Characters';
import { createTrail } from '../ai/perception/trail';
import { DEFAULT_CLASS, heroClass } from '../rules/Classes';
import type { HeroClassId } from '../rules/Classes';
/** Players regain one hit point this often while unhurt. */
const PLAYER_REGEN_TICKS = 180;
const PLAYER_SPEED = 1.2;
const PLAYER_FRICTION = 0.4;
/** Half-width of the player's collision box in pixels (two thirds of the original 10). */
const PLAYER_RADIUS = 7;
/** What a player has with no gear on: ticks of sprinting a full stamina bar allows. */
export const BASE_SPRINT = 120;

/** A hero of the given class (src/data/classes.json): its sprite, hit points and abilities come from there. */
export function createPlayer(x: number, y: number, classId: HeroClassId = DEFAULT_CLASS): Entity {
  const cls = heroClass(classId);
  return world.add({
    position: { x, y },
    velocity: { x: 0, y: 0 },
    radius: { x: PLAYER_RADIUS, y: PLAYER_RADIUS },
    blocking: true,
    physicsSlide: true,
    team: Team.Player,
    health: { current: cls.hitPoints, max: cls.hitPoints },
    heroClass: cls.id,
    spellbook: { recovery: cls.spells.map(() => 0) },
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
    ...characterComponents(cls.character),
    playerInput: {
      up: false, down: false, left: false, right: false,
      attack: false, use: false, sprint: false,
      mouseX: 0, mouseY: 0,
      mouseAiming: true,
      keyAim: null,
      spellSlot: 0,
      intents: { use: false, attack: false, cast: false, inventoryOpen: false, swap: false },
    },
    trail: createTrail(),
    playerStats: {
      level: 1,
      exp: 0,
      gold: 0,
      swordTier: 1,
      hitDice: 1,
      sprinting: false,
      sprint: 0,
      maxSprint: BASE_SPRINT,
      sprintLocked: false,
      kills: 0,
      goldEarned: 0,
      lootBonus: 0,
    },
    inventory: [],
    equipped: {},
    swordCooldown: 0,
    minimapColor: 0x4080ff,
  });
}
