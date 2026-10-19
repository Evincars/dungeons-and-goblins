import { world, Team } from '../world';
import type { Entity } from '../world';
import { characterComponents } from '../characters/Characters';

export function createPlayer(x: number, y: number): Entity {
  return world.add({
    position: { x, y },
    velocity: { x: 0, y: 0 },
    radius: { x: 10, y: 10 },
    blocking: true,
    physicsSlide: true,
    team: Team.Player,
    health: { current: 100, max: 100 },
    hurtTime: 0,
    freezeTime: 0,
    bounceWallTime: 0,
    regenInterval: 180,
    regenAmount: 1,
    regenTimer: 180,
    speed: 1.2,
    friction: 0.4,
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
      intents: { use: false, attack: false, cast: false, inventoryOpen: false, inventoryUse: false },
    },
    playerStats: {
      level: 1,
      exp: 0,
      gold: 0,
      swordTier: 1,
      armorTier: 0,
      sprinting: false,
      sprint: 0,
      maxSprint: 120,
      sprintLocked: false,
      kills: 0,
    },
    inventory: [],
    equipped: {},
    swordCooldown: 0,
    minimapColor: 0x4080ff,
  });
}
