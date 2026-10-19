import { world, Team, Facing } from '../world';
import type { Entity } from '../world';
import { heroMeta } from '../assets/AssetLoader';

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
    facing: Facing.South,
    aimVector: { x: 0, y: 1 },
    walkTime: 0,
    // Centre-anchored sprite: lift it so the sheet's ground point sits on the entity position.
    yOffset: Math.round(heroMeta.groundY - heroMeta.cellH / 2),
    flashTime: 0,
    visual: { sheet: 'hero_idle', directional: true, flipX: false },
    animation: {
      sheet: 'hero_idle',
      frameX: 0,
      frameY: 0,
      frameCount: 2,
      frameTime: 30,
      timer: 0,
      loop: true,
    },
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
