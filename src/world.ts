import { World } from 'miniplex';
import type { Sprite, Container, Graphics } from 'pixi.js';
import type { PixelLabel } from './ui/PixelText';

export const enum Team { Neutral = 0, Player = 1 }

export const enum Facing { North = 0, East = 1, South = 2, West = 3 }

export type InventoryItem = {
  type: 'health_potion' | 'mana_potion' | 'sword_scroll' | 'armor_piece';
  name: string;
  value: number;
};

export type Entity = {
  // --- spatial ---
  position?: { x: number; y: number };
  velocity?: { x: number; y: number };
  radius?: { x: number; y: number };
  blocking?: true;
  physicsSlide?: true;

  // --- team ---
  team?: Team;

  // --- health / combat ---
  health?: { current: number; max: number };
  hurtTime?: number;
  freezeTime?: number;
  bounceWallTime?: number;
  regenInterval?: number;
  regenAmount?: number;
  regenTimer?: number;
  deathPoints?: number;

  // --- movement ---
  facing?: number;
  speed?: number;
  friction?: number;
  strength?: number;
  aimVector?: { x: number; y: number };
  walkTime?: number;
  limp?: number;
  bump?: { x: number; y: number };
  chasing?: boolean;

  // --- rendering ---
  visual?: { sheet: string; col?: number; row?: number; scale?: number };
  frame?: number;
  sprite?: Sprite;
  container?: Container;
  yOffset?: number;
  flashTime?: number;
  healthBarOffset?: number;
  healthBar?: { container: Container; fill: Sprite };
  hurtOverlay?: Sprite;
  fallMask?: Graphics;
  mobType?: string;
  /** Runtime display label (price etc.) */
  priceLabel?: PixelLabel;

  // --- animation ---
  animation?: {
    sheet: string;
    frameX: number;
    frameY: number;
    frameCount: number;
    frameTime: number;
    timer: number;
    loop: boolean;
  };

  // --- short-lived effects ---
  fx?: {
    age: number;
    duration: number;
    frames: number;
    cycle?: boolean;
    scale?: number;
    rise?: number;
    orderId?: number;
    orderBias?: number;
  };

  // --- player ---
  playerInput?: {
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
    attack: boolean;
    use: boolean;
    sprint: boolean;
    mouseX: number;
    mouseY: number;
    mouseAiming: boolean;
    keyAim: { x: number; y: number } | null;
    /** One-shot requests raised for a single tick by key presses. */
    intents: { use: boolean; attack: boolean; inventoryOpen: boolean; inventoryUse: boolean };
  };
  playerStats?: {
    level: number;
    exp: number;
    gold: number;
    swordTier: number;
    armorTier: number;
    sprinting: boolean;
    sprint: number;
    maxSprint: number;
    sprintLocked: boolean;
    kills: number;
  };
  inventory?: InventoryItem[];

  // --- sword melee ---
  /** Active swing hitbox: ticks remaining, direction, damage */
  swordSwing?: {
    ticks: number;
    dirX: number;
    dirY: number;
    damage: number;
    range: number;
    hitIds: Set<number>;
  };
  swordCooldown?: number;

  // --- loot ---
  loot?: {
    value: number;
    kind: 'coin' | 'gem' | 'potion' | 'sword_scroll' | 'armor_piece';
    velX: number;
    velY: number;
    suckRadius: number;
    glide: number;
    age: number;
    life: number;
    burstTicks?: number;
  };

  // --- world item (picked up to inventory) ---
  item?: { type: InventoryItem['type']; name: string; value: number };

  // --- chest ---
  chest?: { opened: boolean; disappearTicks: number };

  // --- spawner / nest ---
  spawner?: {
    mobType: string;
    interval: number;
    timer: number;
    spawnCount: number;
    maxSpawns: number;
  };
  spawnedBy?: number;

  // --- torch (light source) ---
  torch?: { radius: number; color: number; flicker: number };

  // --- AI ---
  ai?: {
    type: 'wander' | 'chase';
    targetId?: number;
    path?: Array<{ x: number; y: number }>;
    repathIn?: number;
    retargetIn?: number;
  };

  // --- falling ---
  falling?: { age: number; duration: number };

  // --- ephemeral ---
  ephemeral?: { age: number; life: number; drop: number };

  // --- footstep / dust ---
  stepTimer?: number;
  dustTimer?: number;

  // --- respawn ---
  respawnTicks?: number;

  // --- minimap ---
  minimapColor?: number;

  // --- tile reference ---
  wallTile?: { tileX: number; tileY: number };

  // --- lifecycle ---
  removed?: true;
};

export const world = new World<Entity>();

export const q = {
  positioned:  world.with('position'),
  physical:    world.with('position', 'velocity', 'radius'),
  renderable:  world.with('position', 'sprite'),
  animated:    world.with('animation', 'sprite'),
  needsSprite: world.with('visual', 'position').without('sprite'),
  players:     world.with('position', 'playerInput', 'playerStats', 'health'),
  mobs:        world.with('position', 'health', 'ai'),
  loot:        world.with('position', 'loot'),
  spawners:    world.with('position', 'spawner'),
  torches:     world.with('position', 'torch'),
  walls:       world.with('position', 'wallTile'),
  chests:      world.with('position', 'chest'),
  items:       world.with('position', 'item'),
  ephemerals:  world.with('position', 'ephemeral'),
};
