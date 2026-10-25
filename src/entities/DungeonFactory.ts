import { world, Team } from '../world';
import type { Entity, InventoryItem } from '../world';
import { createTile, TileType, TILE_WIDTH, TILE_HEIGHT } from '../level/TileType';
import type { Level } from '../level/Level';
import { PROPS, PROP_GROUND } from '../level/Props';
import type { PropDef, PropKind, PropPlacement } from '../level/Props';
import { stashCoins } from './LootFactory';
import type { DoorData, RoomData } from '../level/generators/DungeonBuilder';

/**
 * The fixtures of a generated dungeon: rooms, the safe-room door, torches, props, chests, exit and shop.
 * Rooms, torches and props come straight from the seeded layout, so every co-op browser builds its own
 * (`localOnly`); the rest change during play and are the host's to send.
 */

/** Campfires light the exit room warmly, flickering like torches; the art is a 4-frame 24px strip. */
const CAMPFIRE_LIGHT_RADIUS = 96;
const CAMPFIRE_FRAMES = 4;
const CAMPFIRE_FRAME_TICKS = 6;
const CAMPFIRE_SCALE = 1.5;
/** The fire's art stands on the lower part of its 24px cell. */
const CAMPFIRE_LIFT = 10;
/** Torch mounts sit this far above the foot of their wall. */
const TORCH_LIFT = 30;
const TORCH_LIGHT_RADIUS = 120;
const TORCH_COLOR = 0xffcc66;
const TORCH_SCALE = 1.5;
const TORCH_FRAMES = 4;
const TORCH_FRAME_TICKS = 7;
/** Wall props hang from just under the face's cap molding. */
const HANG_TOP = 54;
const CHEST_HEALTH = 20;
/**
 * Chests are drawn at a fixed three-quarter size; the art (chest_small.png) is a 32×53 frame with the chest
 * on its bottom edge, so this lift (at that size) rests it on its tile.
 */
const CHEST_SCALE = 0.75;
const CHEST_LIFT = 12;

/** What the shop keeper sells: gear for every slot. */
export const SHOP_ITEMS: readonly InventoryItem[] = [
  { type: 'weapon', name: 'Short Sword',   value: 50,  gear: 'weapon',  base: 'shortsword', icon: 'item_arms_00', stats: { strength: 2 }, weight: 1.8 },
  { type: 'weapon', name: 'Long Sword',    value: 120, gear: 'weapon',  base: 'longsword',  icon: 'item_arms_11', stats: { strength: 4 }, weight: 3.0 },
  { type: 'weapon', name: 'Hand Axe',      value: 70,  gear: 'weapon',  base: 'handaxe',    icon: 'item_arms_13', stats: { strength: 3 }, weight: 2.5 },
  { type: 'shield', name: 'Wooden Shield', value: 45,  gear: 'offhand', base: 'shield',     icon: 'item_arms_08', stats: { dexterity: 1 }, weight: 4.5 },
  { type: 'helmet', name: 'Iron Helm',     value: 40,  gear: 'head',    icon: 'prop_armor_bust2', stats: { dexterity: 1 }, weight: 2.0 },
  { type: 'armor',  name: 'Chain Mail',    value: 80,  gear: 'armor',   base: 'chain_mail', icon: 'prop_armor_bust', stats: { dexterity: 2, constitution: 1 }, weight: 12.0 },
  { type: 'ring',   name: 'Copper Ring',   value: 60,  gear: 'trinket', icon: 'icon_ring', stats: { charisma: 2 }, weight: 0.1 },
];

/** ECS metadata for a room of the layout. */
export function createRoom(room: RoomData): Entity {
  return world.add({ room: { id: room.id, type: room.type, bounds: { x: room.x, y: room.y, w: room.w, h: room.h } }, localOnly: true });
}

/** The door that seals the safe room once every player has left it. */
/**
 * The safe room's door, locked: its doorway is barred (solid, drawn as floor) under a portcullis on every
 * tile, until the lever beside it is pulled.
 */
export function createSafeDoor(door: DoorData, level: Level): Entity {
  const first = door.tiles[0];
  const middle = door.tiles[Math.floor(door.tiles.length / 2)] ?? first;
  for (const t of door.tiles) {
    level.setTile(t.x, t.y, createTile(TileType.Obstacle, 0));
    createGate(t.x, t.y);
  }
  return world.add({
    position: { x: first.x * TILE_WIDTH + TILE_WIDTH / 2, y: middle.y * TILE_HEIGHT + TILE_HEIGHT / 2 },
    door: { tiles: door.tiles, boundaryX: door.boundaryX, closed: false, locked: true, closingTicks: null },
  });
}

/** The portcullis is drawn this far up from the foot of its tile: it reaches a little above the doorway. */
export const GATE_LIFT = 20;

/** A portcullis over one doorway tile, standing on the tile's foot so whoever is in front of it draws over it. */
function createGate(tx: number, ty: number): Entity {
  return world.add({
    position: { x: tx * TILE_WIDTH + TILE_WIDTH / 2, y: (ty + 1) * TILE_HEIGHT - 1 },
    visual: { sheet: 'portcullis' },
    yOffset: GATE_LIFT,
    gate: { lift: 0 },
  });
}

/** The lever beside the safe room's door; pulling it (E) raises the portcullis. */
export function createLever(x: number, y: number): Entity {
  return world.add({
    position: { x, y },
    lever: { pulled: false, rest: 0 },
    visual: { sheet: 'lever', col: 0, row: 0 },
    radius: { x: 8, y: 6 },
    yOffset: 8,
  });
}

/**
 * A torch hung on a brick face. The entity stands at the foot of the wall (so anyone in front of the
 * wall draws over it); the sprite is lifted up onto the bricks.
 */
export function createTorch(x: number, y: number): Entity {
  return world.add({
    position: { x, y: y + TORCH_LIFT },
    torch: { radius: TORCH_LIGHT_RADIUS, color: TORCH_COLOR, flicker: Math.random() * Math.PI * 2 },
    visual: { sheet: 'torch', scale: TORCH_SCALE },
    animation: {
      sheet: 'torch',
      frameX: 0,
      frameY: 0,
      frameCount: TORCH_FRAMES,
      frameTime: TORCH_FRAME_TICKS,
      timer: Math.floor(Math.random() * TORCH_FRAMES),
      loop: true,
    },
    yOffset: TORCH_LIFT,
    localOnly: true,
  });
}

/** A campfire on its (blocked) tile in the exit room. */
export function createCampfire(x: number, y: number): Entity {
  return world.add({
    position: { x, y },
    visual: { sheet: 'campfire', scale: CAMPFIRE_SCALE },
    animation: {
      sheet: 'campfire', frameX: 0, frameY: 0, frameCount: CAMPFIRE_FRAMES, frameTime: CAMPFIRE_FRAME_TICKS,
      timer: Math.floor(Math.random() * CAMPFIRE_FRAME_TICKS), loop: true,
    },
    glow: { radius: CAMPFIRE_LIGHT_RADIUS, flicker: Math.random() * Math.PI * 2 },
    yOffset: CAMPFIRE_LIFT,
    localOnly: true,
  });
}

/** The looping animation of an animated prop (candle flames, swaying plants), started at a random frame. */
function propAnimation(sheet: string, def: PropDef): Pick<Entity, 'animation'> {
  if (!def.frames) return {};
  const frameCount = def.frames.length;
  const frameTime = def.frameTime ?? 1;
  return {
    animation: {
      sheet, frameX: Math.floor(Math.random() * frameCount), frameY: 0, frameCount, frameTime,
      timer: Math.floor(Math.random() * frameTime), loop: true,
    },
  };
}

/** The light a prop gives off, if any: firelight, or a crystal's cold shine. */
function propGlow(def: PropDef): Pick<Entity, 'glow'> {
  return def.glow ? { glow: { radius: def.glow, cool: def.coolGlow } } : {};
}

/** A decorative prop: standing on its tile, or hung on the brick face above it. */
export function createProp(p: PropPlacement): Entity {
  const def: PropDef = PROPS[p.kind];
  const sheet = `prop_${p.kind}`;
  const x = p.tx * TILE_WIDTH + TILE_WIDTH / 2;
  const h = def.rect.h;
  if (def.mount === 'wall') {
    // Stands at the foot of the wall like a torch, drawn up on the bricks.
    return world.add({
      position: { x, y: p.ty * TILE_HEIGHT }, visual: { sheet }, yOffset: HANG_TOP - h / 2, localOnly: true,
    });
  }
  return world.add({
    position: { x, y: p.ty * TILE_HEIGHT + PROP_GROUND },
    visual: { sheet },
    yOffset: h / 2,
    localOnly: true,
    ...propAnimation(sheet, def),
    ...propGlow(def),
  });
}

/**
 * The floor things that can be opened or searched, by what they are: coffins and sarcophagi still shut, barrels,
 * crates and boxes, urns, vases and jars, and sacks. (Open bowls, broken or spilt things, racks, shelves
 * and whatever hangs on a wall, such as the cauldrons, are not.) What each holds, if anything, is rolled by `stashCoins`.
 */
const OPENABLE_PROPS: ReadonlySet<PropKind> = new Set<PropKind>([
  'coffin', 'coffin_cracked', 'sarcophagus', 'sarcophagus2',
  'barrel', 'barrel2', 'supplies_barrel',
  'crate', 'crate2', 'crate_stack', 'crate_stack2', 'supplies_crate', 'supplies_crates',
  'urn', 'urn_small', 'urn_green', 'urn_green_small', 'supplies_vase', 'supplies_jar',
  'sack', 'sack_m', 'sack_s', 'sack_xs', 'sack2', 'sack2_m', 'sack2_s', 'sack2_xs', 'sacks_pile', 'sacks_pile2', 'sacks_pile3',
]);
/** A stash's body reaches this far up and down its prop's foot, for the crosshair and the corner brackets. */
const STASH_DEPTH = 6;

/** Whether a prop of this kind stands on the floor and can be opened (searched with "use"). */
export function isOpenable(kind: PropKind): boolean {
  return OPENABLE_PROPS.has(kind) && PROPS[kind].mount === 'floor';
}

/**
 * What an openable prop holds — often nothing (made by whoever runs the game, and sent to guests: the prop itself
 * is decor every browser builds). It stands where the prop is drawn, its body the prop's size.
 */
export function createStash(p: PropPlacement): Entity | null {
  if (!isOpenable(p.kind)) return null;
  const def: PropDef = PROPS[p.kind];
  return world.add({
    position: { x: p.tx * TILE_WIDTH + TILE_WIDTH / 2, y: p.ty * TILE_HEIGHT + PROP_GROUND },
    yOffset: def.rect.h / 2,
    radius: { x: def.rect.w / 2, y: STASH_DEPTH },
    stash: { coins: stashCoins() },
  });
}

export function createChest(x: number, y: number): Entity {
  return world.add({
    position: { x, y },
    chest: { opened: false, disappearTicks: -1, drops: 'chest' },
    health: { current: CHEST_HEALTH, max: CHEST_HEALTH },
    hurtTime: 0, freezeTime: 0,
    radius: { x: 7, y: 4 },
    blocking: true,
    physicsSlide: true,
    visual: { sheet: 'chest_dark', col: 0, row: 0, scale: CHEST_SCALE },
    yOffset: CHEST_LIFT,
    healthBarOffset: 14,
    minimapColor: 0xffd040,
  });
}

/** The dummy is drawn half as big again; its feet are 28 px down its 32 px frame. */
const DUMMY_SCALE = 1.5;
const DUMMY_FEET_Y = 28;
const DUMMY_FRAME = 32;
const DUMMY_IDLE_FRAMES = 4;
const DUMMY_FRAME_TICKS = 6;
/** Health only for show: the dummy is healed after every blow. */
const DUMMY_HEALTH = 1000;

/** The training dummy in the safe room: swords, spells and arrows can be tried on it. */
export function createTrainingDummy(x: number, y: number): Entity {
  return world.add({
    position: { x, y },
    health: { current: DUMMY_HEALTH, max: DUMMY_HEALTH },
    hurtTime: 0, freezeTime: 0,
    radius: { x: 10, y: 6 },
    blocking: true,
    team: Team.Neutral,
    dummy: { row: 0 },
    visual: { sheet: 'training_dummy', scale: DUMMY_SCALE },
    animation: { sheet: 'training_dummy', frameX: 0, frameY: 0, frameCount: DUMMY_IDLE_FRAMES, frameTime: DUMMY_FRAME_TICKS, timer: 0, loop: true },
    yOffset: (DUMMY_FEET_Y - DUMMY_FRAME / 2) * DUMMY_SCALE,
  });
}

export function createExitButton(x: number, y: number): Entity {
  return world.add({
    position: { x, y },
    exitButton: { activated: false },
    radius: { x: 14, y: 12 },
    visual: { sheet: 'exit_button', col: 0, row: 0 },
    yOffset: 16,
    minimapColor: 0x00ff44,
  });
}

export function createShopNpc(x: number, y: number): Entity {
  return world.add({
    position: { x, y },
    shopNpc: { items: SHOP_ITEMS.map((item) => ({ ...item })) },
    radius: { x: 10, y: 10 },
    blocking: true,
    visual: { sheet: 'spawner', col: 0, row: 0 },
    yOffset: 8,
    minimapColor: 0xffaa00,
  });
}
