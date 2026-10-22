import { World } from 'miniplex';
import type { Sprite, Container, Graphics } from 'pixi.js';
import type { PixelLabel } from './ui/PixelText';
import type { CharacterState } from './characters/CharacterDef';
import type { DropTableId } from './entities/Drops';

export const enum Team { Neutral = 0, Player = 1 }

export const enum Facing { North = 0, East = 1, South = 2, West = 3 }

/** Where a player wears or holds gear, in the order the inventory screen lists them. */
export const EQUIP_SLOTS = ['head', 'armor', 'primary', 'secondary', 'legs', 'other1', 'other2', 'ammo'] as const;
export type EquipSlot = (typeof EQUIP_SLOTS)[number];

export function isEquipSlot(value: string): value is EquipSlot {
  return EQUIP_SLOTS.some((slot) => slot === value);
}

/** What kind of gear an item is, which decides the slots it fits (see entities/Items.ts). */
export const GEAR_KINDS = ['head', 'armor', 'weapon', 'offhand', 'legs', 'trinket', 'ammo'] as const;
export type GearKind = (typeof GEAR_KINDS)[number];

export function isGearKind(value: unknown): value is GearKind {
  return GEAR_KINDS.some((kind) => kind === value);
}

/** A character's attributes, shown on the inventory screen; gear adds to them. */
export const STAT_NAMES = ['strength', 'intelligence', 'stamina', 'defence', 'luck', 'mana'] as const;
export type StatName = (typeof STAT_NAMES)[number];
export type ItemStats = Partial<Record<StatName, number>>;

export function isStatName(value: unknown): value is StatName {
  return STAT_NAMES.some((stat) => stat === value);
}

export const ITEM_TYPES = ['weapon', 'shield', 'helmet', 'armor', 'boots', 'ring', 'ammo'] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export function isItemType(value: unknown): value is ItemType {
  return ITEM_TYPES.some((type) => type === value);
}

export type InventoryItem = {
  type: ItemType;
  name: string;
  value: number;
  /** The catalogue entry it came from (src/data/*.json), if any. */
  id?: string;
  /** What sort of weapon or thing it is ('bow', 'axe', 'arrows'…), for game rules and tooltips. */
  kind?: string;
  /** Equipment fits the slots of its kind; anything without one only goes in the bag. */
  gear?: GearKind;
  /** Texture key of its picture. */
  icon?: string;
  stats?: ItemStats;
  /** How many there are in this one square (arrows); a single thing has none. */
  count?: number;
};

/** Who controls a player character: the host, or one of up to three guests in a co-op room. */
export const PLAYER_SLOTS = ['host', 'p2', 'p3', 'p4'] as const;
export type PlayerSlot = (typeof PLAYER_SLOTS)[number];

export function isPlayerSlot(value: unknown): value is PlayerSlot {
  return PLAYER_SLOTS.some((slot) => slot === value);
}

/** The goblin_* kinds are the three goblins drawn in /other-orcs, the wizards have art of their own; the rest share the old orc art. */
export const MOB_TYPES = [
  'goblin', 'skeleton', 'orc', 'troll', 'goblin_grunt', 'goblin_rogue', 'goblin_warrior', 'ghost_wizard', 'evil_wizard',
] as const;
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
  /** `rotation`: radians the sprite is turned (an arrow points where it flies). */
  visual?: { sheet: string; col?: number; row?: number; scale?: number; rotation?: number };
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
    intents: { use: boolean; attack: boolean; cast: boolean; inventoryOpen: boolean };
  };
  /** Breadcrumbs of where this player walked, for enemies to follow. */
  trail?: Trail;

  // --- spellcasting ---
  /** Active cast: ticks elapsed, aim locked at the start, whether the bolt has left the hand. */
  casting?: { ticks: number; dirX: number; dirY: number; released: boolean };
  castCooldown?: number;

  // --- projectiles ---
  /** `arrow`: an arrow, which glints where it strikes, where a spell bolt bursts in dirt. */
  projectile?: { damage: number; life: number; team: number; arrow?: boolean };

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
    /** Mana for spells, and how much it holds (raised by the Mana stat of worn gear). */
    mana: number;
    maxMana: number;
    /** Extra spell damage (from Intelligence) and the share more coins enemies drop (from Luck). */
    spellBonus: number;
    lootBonus: number;
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
  /** Ticks until the next arrow can be loosed. */
  arrowCooldown?: number;

  // --- loot ---
  loot?: {
    value: number;
    /** Index into LOOT_KINDS (entities/LootFactory.ts): which coin or gem it is. */
    kind: number;
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
  /** `drops`: the DROP_TABLES entry (entities/Drops.ts) it throws out when opened. */
  chest?: { opened: boolean; disappearTicks: number; drops: DropTableId };

  // --- training dummy (safe room): takes every kind of hit, never falls ---
  /** `row`: the strip it is playing (0 idle, 1 a hit, 2 a heavy hit). */
  dummy?: { row: number };

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
  return { use: false, attack: false, cast: false, inventoryOpen: false };
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

/** Something a sword, spell or arrow can hit: a live enemy, or the training dummy. */
export type Target = Entity & { position: { x: number; y: number }; radius: { x: number; y: number }; health: { current: number; max: number } };

export function isTarget(e: Entity | undefined): e is Target {
  return !!e && !!e.position && !!e.radius && !!e.health && (!!e.ai || !!e.dummy);
}

/** Whether a player can be hurt, hunted or interact right now. */
export function isActivePlayer(player: Player): boolean {
  return player.health.current > 0 && player.respawnTicks === undefined && !player.removed;
}
