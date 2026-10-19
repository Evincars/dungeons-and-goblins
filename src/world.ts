import { World } from 'miniplex';
import type { Sprite, Container, Graphics } from 'pixi.js';
import type { PixelLabel } from './ui/PixelText';
import type { CharacterState } from './characters/CharacterDef';

export const enum Team { Neutral = 0, Player = 1 }

export const enum Facing { North = 0, East = 1, South = 2, West = 3 }

export type EquipSlot = 'weapon' | 'helmet' | 'chest' | 'gloves' | 'boots' | 'ring';

export type InventoryItem = {
  type: 'health_potion' | 'mana_potion' | 'weapon' | 'helmet' | 'chest' | 'gloves' | 'boots' | 'ring' | 'sword_scroll' | 'armor_piece';
  name: string;
  value: number;
  slot?: EquipSlot;
  icon?: number;   // column index in item icon sheet
  stats?: { attack?: number; defense?: number; hp?: number };
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
  /**
   * Side-view character driven by a CharacterDef (see characters/ and the Character*System files):
   * the state picks the clip, `flipX` mirrors it to face left.
   */
  character?: {
    def: string;
    state: CharacterState;
    frame: number;
    timer: number;
    /** The current clip has shown its last frame (one-shot and hold clips). */
    finished: boolean;
    /** A one-shot state that has played out while its trigger still holds; it can't replay until the trigger lets go. */
    spent?: CharacterState;
    flipX: boolean;
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
    intents: { use: boolean; attack: boolean; cast: boolean; inventoryOpen: boolean; inventoryUse: boolean };
  };

  // --- spellcasting ---
  /** Active cast: ticks elapsed, aim locked at the start, whether the bolt has left the hand. */
  casting?: { ticks: number; dirX: number; dirY: number; released: boolean };
  castCooldown?: number;

  // --- projectiles ---
  projectile?: { damage: number; life: number; team: number };

  /** Point light this entity emits (spell bolts, …). */
  glow?: { radius: number };
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
  equipped?: Partial<Record<EquipSlot, InventoryItem>>;

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

  // --- dungeon room (ECS room metadata) ---
  room?: {
    id: number;
    type: 'safe' | 'dungeon' | 'exit';
    bounds: { x: number; y: number; w: number; h: number };
  };

  // --- safe zone (enemies can't attack inside) ---
  safeZone?: true;

  // --- exit button (players interact to end level) ---
  exitButton?: { activated: boolean };

  // --- shop NPC ---
  shopNpc?: { items: import('./world').InventoryItem[] };

  // --- door (seals the safe room once players leave) ---
  door?: { tiles: Array<{ x: number; y: number }>; boundaryX: number; closed: boolean };

  // --- lifecycle ---
  removed?: true;
};

export const world = new World<Entity>();

export const q = {
  positioned:  world.with('position'),
  physical:    world.with('position', 'velocity', 'radius'),
  renderable:  world.with('position', 'sprite'),
  animated:    world.with('animation', 'sprite'),
  characters:  world.with('character', 'visual', 'sprite'),
  needsSprite: world.with('visual', 'position').without('sprite'),
  players:     world.with('position', 'playerInput', 'playerStats', 'health'),
  mobs:        world.with('position', 'health', 'ai'),
  loot:        world.with('position', 'loot'),
  spawners:    world.with('position', 'spawner'),
  torches:     world.with('position', 'torch'),
  chests:      world.with('position', 'chest'),
  items:       world.with('position', 'item'),
  ephemerals:  world.with('position', 'ephemeral'),
};
