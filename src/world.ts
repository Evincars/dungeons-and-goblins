import { World } from 'miniplex';
import type { Sprite, Container, Graphics } from 'pixi.js';
import type { PixelLabel } from './ui/PixelText';
import type { CharacterState } from './characters/CharacterDef';

export const enum Team { Neutral = 0, Player = 1 }

export const enum Facing { North = 0, East = 1, South = 2, West = 3 }

export const EQUIP_SLOTS = ['weapon', 'helmet', 'chest', 'gloves', 'boots', 'ring'] as const;
export type EquipSlot = (typeof EQUIP_SLOTS)[number];

export function isEquipSlot(value: string): value is EquipSlot {
  return EQUIP_SLOTS.some((slot) => slot === value);
}

export const ITEM_TYPES = [
  'health_potion', 'mana_potion', 'weapon', 'helmet', 'chest', 'gloves', 'boots', 'ring', 'sword_scroll', 'armor_piece',
] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export function isItemType(value: unknown): value is ItemType {
  return ITEM_TYPES.some((type) => type === value);
}

export type InventoryItem = {
  type: ItemType;
  name: string;
  value: number;
  slot?: EquipSlot;
  icon?: number;   // column index in item icon sheet
  stats?: { attack?: number; defense?: number; hp?: number };
};

/** Who controls a player character: the host, or one of up to three guests in a co-op room. */
export const PLAYER_SLOTS = ['host', 'p2', 'p3', 'p4'] as const;
export type PlayerSlot = (typeof PLAYER_SLOTS)[number];

export function isPlayerSlot(value: unknown): value is PlayerSlot {
  return PLAYER_SLOTS.some((slot) => slot === value);
}

/** The goblin_* kinds are the three goblins drawn in /other-orcs; the rest share the old orc art. */
export const MOB_TYPES = ['goblin', 'skeleton', 'orc', 'troll', 'goblin_grunt', 'goblin_rogue', 'goblin_warrior'] as const;
export type MobType = (typeof MOB_TYPES)[number];

export function isMobType(value: string): value is MobType {
  return MOB_TYPES.some((type) => type === value);
}

/**
 * What an enemy is doing (its Yuka StateMachine state): ambling about unaware, the beat after it
 * spots someone, the fight itself, and the hunt along the player's trail once it has lost sight of them.
 */
export const MOB_STATES = ['idle', 'alert', 'engage', 'search'] as const;
export type MobState = (typeof MOB_STATES)[number];

/**
 * How an engaged enemy fights as part of its squad: straight at the player, round the block to take
 * them from behind, or over to an ally that needs help.
 */
export const TACTIC_ROLES = ['direct', 'flank', 'support'] as const;
export type TacticRole = (typeof TACTIC_ROLES)[number];

/** Enemy brain state; the decisions themselves live in src/ai. */
export type MobAI = {
  state: MobState;
  role: TacticRole;
  /** Player being hunted. */
  targetId?: number;
  /** Ally being helped while in the support role. */
  allyId?: number;
  /** Tiles still to walk, as `tx + ty * width`; `step` is the next one. */
  route: number[];
  step: number;
  /** Tile the route leads to (-1 when there is none). */
  routeGoal: number;
  /** Ticks until the route is planned again. */
  repathIn: number;
  /** Ticks until it next looks around for players. */
  senseIn: number;
  /** Ticks spent in the current state. */
  stateTicks: number;
  /** Ticks during which it ignores players after being dropped from a crowded squad. */
  calmTicks: number;
  /** Where the target was last seen (by it or by its squad), and on which tick. */
  lastSeenX: number;
  lastSeenY: number;
  lastSeenTick: number;
  /** Tick of the newest trail crumb it has already walked past while searching. */
  trailTick: number;
};

/**
 * The way a player walked, as a ring of the tile centres they entered, oldest overwritten first.
 * Enemies that lose sight of a player follow it to where they went.
 */
export type Trail = {
  xs: Float32Array;
  ys: Float32Array;
  ticks: Float64Array;
  /** Next slot to write. */
  head: number;
  count: number;
  /** Tile the newest crumb was dropped on. */
  lastTile: number;
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
  /** Ticks left on a mob's attack animation, started when it lands a hit. */
  attackTime?: number;
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
  /** The stamina bar under a player while their sprint is used up (presentation only). */
  sprintBar?: Sprite;
  fallMask?: Graphics;
  mobType?: MobType;
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
  /** Which seat in the room controls this character. */
  playerSlot?: PlayerSlot;
  /** Name shown above the character in multiplayer. */
  playerName?: string;
  /** Controlled from elsewhere (a guest's browser, or the host's on a guest): local input never touches it. */
  remoteInput?: true;
  /** A remote player's crosshair, in world pixels (local players aim with this screen's pointer). */
  aimWorld?: { x: number; y: number };
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
  /** Breadcrumbs of where this player walked, for enemies to follow. */
  trail?: Trail;

  // --- spellcasting ---
  /** Active cast: ticks elapsed, aim locked at the start, whether the bolt has left the hand. */
  casting?: { ticks: number; dirX: number; dirY: number; released: boolean };
  castCooldown?: number;

  // --- projectiles ---
  projectile?: { damage: number; life: number; team: number };

  /** Point light this entity emits (spell bolts, …). */
  glow?: {
    radius: number;
    /** A cold light (crystals) instead of firelight. */
    cool?: boolean;
    /** Phase of a flame's flicker; steady when left out. */
    flicker?: number;
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
    /** All gold picked up this level, whatever was spent since. */
    goldEarned: number;
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
    /** Entities this swing already hit (a list: a swing meets a handful at most, and it travels as JSON). */
    hitIds: number[];
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
  item?: { type: ItemType; name: string; value: number };

  // --- chest ---
  chest?: { opened: boolean; disappearTicks: number };

  // --- spawner / nest ---
  spawner?: {
    mobType: MobType;
    interval: number;
    timer: number;
    spawnCount: number;
    maxSpawns: number;
  };
  spawnedBy?: number;

  // --- torch (light source) ---
  torch?: { radius: number; color: number; flicker: number };

  // --- AI ---
  ai?: MobAI;

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
  shopNpc?: { items: InventoryItem[] };

  // --- door (seals the safe room once players leave) ---
  door?: { tiles: Array<{ x: number; y: number }>; boundaryX: number; closed: boolean };

  // --- lifecycle ---
  removed?: true;
  /**
   * Built on every machine from the level seed (torches, props, rooms), so it is never sent over the
   * network: each browser makes its own.
   */
  localOnly?: true;
};

export const world = new World<Entity>();

/** Queries shared by several systems; declared once, because resolving one scans every registered query. */
export const q = {
  positioned:  world.with('position'),
  physical:    world.with('position', 'velocity', 'radius'),
  renderable:  world.with('position', 'sprite'),
  animated:    world.with('animation', 'sprite'),
  characters:  world.with('character', 'visual', 'sprite'),
  needsSprite: world.with('visual', 'position').without('sprite'),
  players:     world.with('position', 'playerInput', 'playerStats', 'health'),
  mobs:        world.with('position', 'health', 'ai'),
  walkingMobs: world.with('position', 'velocity', 'radius', 'health', 'ai'),
  loot:        world.with('position', 'loot'),
  spawners:    world.with('position', 'spawner'),
  torches:     world.with('position', 'torch'),
  chests:      world.with('position', 'chest'),
  items:       world.with('position', 'item'),
  ephemerals:  world.with('position', 'ephemeral'),
  glowing:     world.with('position', 'glow'),
  removed:     world.with('removed'),
};

export type Player = (typeof q.players)['entities'][number];
export type Mob = (typeof q.walkingMobs)['entities'][number];

/** The player this screen controls, for input, the camera, HUD and panels; undefined between levels. */
export function localPlayer(): Player | undefined {
  for (const player of q.players) if (!player.remoteInput) return player;
  return undefined;
}

export type PlayerInput = NonNullable<Entity['playerInput']>;
export type Intents = PlayerInput['intents'];

export function noIntents(): Intents {
  return { use: false, attack: false, cast: false, inventoryOpen: false, inventoryUse: false };
}

/** Lets go of every key and button, e.g. for a remote player whose input stopped arriving. */
export function releaseControls(input: PlayerInput): void {
  input.up = input.down = input.left = input.right = false;
  input.attack = input.use = input.sprint = false;
  input.intents = noIntents();
}

export function isPlayer(e: Entity | undefined): e is Player {
  return !!e && !!e.position && !!e.playerInput && !!e.playerStats && !!e.health;
}

export function isMob(e: Entity | undefined): e is Mob {
  return !!e && !!e.position && !!e.velocity && !!e.radius && !!e.health && !!e.ai;
}

/** Whether a player can be hurt, hunted or interact right now. */
export function isActivePlayer(player: Player): boolean {
  return player.health.current > 0 && player.respawnTicks === undefined && !player.removed;
}
