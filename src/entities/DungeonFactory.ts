import { world, Team } from '../world';
import { TRADER_FRAME, TRADER_SCALE, TRADER_SHEETS } from './Trader';
import { CAMPFIRE_SMOKE, createSmoke } from './Smoke';
import { createWindowFire } from './WindowFire';
import type { Entity, InventoryItem } from '../world';
import { createTile, TileType, TILE_WIDTH, TILE_HEIGHT } from '../level/TileType';
import type { Level } from '../level/Level';
import { COFFINS, PROPS, PROP_GROUND, SARCOPHAGI } from '../level/Props';
import type { PropDef, PropKind, PropPlacement } from '../level/Props';
import { TOMB_GEAR_CHANCE, stashCoins } from './LootFactory';
import { CHEST_TIERS, rollChestTier } from './Drops';
import { DUMMY_STILL } from '../systems/DummySystem';
import { ARMORS, HAND_WEAPONS, MEDALS, SHIELDS, catalogueItem } from './ItemCatalog';
import type { DoorData, RoomData, TilePos } from '../level/generators/DungeonBuilder';

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
/** Its flames burn this far above the middle of its 24 px art (before CAMPFIRE_SCALE): where its sparks and embers fly from. */
const CAMPFIRE_FLAME_RISE = 3;
/** The hearth under it lies centred this far below its middle, under its ring of stones. */
const HEARTH_DROP = 5;
/** Torch mounts sit this far above the foot of their wall. */
const TORCH_LIFT = 30;
const TORCH_LIGHT_RADIUS = 120;
const TORCH_COLOR = 0xffcc66;
const TORCH_SCALE = 1.5;
const TORCH_FRAMES = 4;
const TORCH_FRAME_TICKS = 7;
/** The torch's flame burns this far above the middle of its 16 px art (before TORCH_SCALE): where its sparks fly from. */
const TORCH_FLAME_RISE = 4;
/** Wall props hang from just under the face's cap molding. */
const HANG_TOP = 54;
/**
 * A prop at the foot of a wall stands this far onto the floor below it (on the plinth, in the alcove), so it is drawn
 * over the wall.
 */
const FOOT_DEPTH = 5;
/** A prop's backing is drawn this far behind it. */
const BEHIND = 0.5;
/** How far onto the floor the exit portal's body reaches (where the heroes step up to it). */
const PORTAL_DEPTH = 8;
/**
 * A prop hung on the front of a column is drawn just in front of it, its top this far above the column's foot (under
 * the column's capital).
 */
const FRONT_BIAS = 0.5;
const FRONT_TOP = 62;
/** A castle's wall candle (in place of a torch): drawn this big, its flame this far below the top of its art. */
const SCONCE_SCALE = 1.5;
const SCONCE_FLAME_DROP = 3;
const SCONCE_FRAMES = 3;
const SCONCE_FRAME_TICKS = 8;
/** The castle's wall candle gives a softer, smaller light than a torch. */
const SCONCE_LIGHT_RADIUS = 96;
const CHEST_HEALTH = 20;

/** One of each D&D base of a catalogue list (its first picture), in the order the list has them. */
function onePerBase(from: readonly InventoryItem[]): InventoryItem[] {
  const bases = [...new Set(from.flatMap((item) => (item.base ? [item.base] : [])))];
  return bases.flatMap((base) => catalogueItem(from, base) ?? []);
}

/**
 * What the trader sells (for now everything there is, to try it all out): one of every weapon, shield and armour of the
 * D&D tables, a helm and a ring, and every medal.
 */
export const SHOP_ITEMS: readonly InventoryItem[] = [
  ...onePerBase(HAND_WEAPONS),
  ...onePerBase(SHIELDS),
  { type: 'helmet', name: 'Iron Helm',     value: 40,  gear: 'head',    icon: 'prop_armor_bust2', stats: { dexterity: 1 }, weight: 2.0 },
  ...onePerBase(ARMORS),
  { type: 'ring',   name: 'Copper Ring',   value: 60,  gear: 'trinket', icon: 'icon_ring', stats: { charisma: 2 }, weight: 0.1 },
  ...MEDALS.map((medal) => ({ ...medal })),
];
/** The gold a trader has to buy with at the start of each level. */
export const TRADER_GOLD = 1000;

/** ECS metadata for a room of the layout. */
export function createRoom(room: RoomData): Entity {
  return world.add({ room: { id: room.id, type: room.type, bounds: { x: room.x, y: room.y, w: room.w, h: room.h } }, localOnly: true });
}

/**
 * The safe room's door, locked: its doorway is barred (solid, drawn as floor) under a portcullis on every
 * tile, until the lever beside it is pulled.
 */
export function createSafeDoor(door: DoorData, level: Level): Entity {
  const first = door.tiles[0];
  const middle = door.tiles[Math.floor(door.tiles.length / 2)] ?? first;
  for (const t of door.tiles) level.setTile(t.x, t.y, createTile(TileType.Obstacle, 0));
  createGates(door.tiles);
  return world.add({
    position: { x: first.x * TILE_WIDTH + TILE_WIDTH / 2, y: middle.y * TILE_HEIGHT + TILE_HEIGHT / 2 },
    door: { tiles: door.tiles, boundaryX: door.boundaryX, closed: false, locked: true, closingTicks: null },
  });
}

/**
 * The exit room's door, open: nothing bars its doorway until its lever is pulled; a few seconds later its portcullis
 * drops and shuts the room for good (systems/DoorSystem.ts).
 */
export function createExitDoor(door: DoorData): Entity {
  const first = door.tiles[0];
  const middle = door.tiles[Math.floor(door.tiles.length / 2)] ?? first;
  return world.add({
    position: { x: first.x * TILE_WIDTH + TILE_WIDTH / 2, y: middle.y * TILE_HEIGHT + TILE_HEIGHT / 2 },
    door: { tiles: door.tiles, boundaryX: door.boundaryX, closed: false, locked: false, closingTicks: null, exit: true },
  });
}

/** The portcullis reaches this far above its doorway, up into the wall over it. */
export const GATE_ABOVE = 8;
/** Raised all the way, a portcullis stands this much higher (up in the wall above the doorway). */
export const GATE_RISE = 34;

/**
 * The portcullis over a doorway: one gate per tile (each barred, raised and dropped with its door), the lowest of them
 * drawing the grille, fitted to the whole doorway whatever size its art is (so new art needs no new numbers) and standing
 * on the doorway's foot, so whoever is in front of it draws over it. Down (the locked door), or — `dropping` — raised,
 * about to fall back down and bar the way again.
 */
export function createGates(tiles: readonly TilePos[], dropping = false): void {
  if (tiles.length === 0) return;
  const top = Math.min(...tiles.map((t) => t.y));
  const foot = tiles.reduce((low, t) => (t.y > low.y ? t : low), tiles[0]);
  for (const t of tiles) createGate(t.x, t.y, dropping, t === foot ? foot.y - top + 1 : 0);
}

/** One doorway tile's gate; `span`: the doorway's height in tiles, when this gate draws the grille over it (else 0). */
function createGate(tx: number, ty: number, dropping: boolean, span: number): Entity {
  const lift = dropping ? 1 : 0;
  const h = span * TILE_HEIGHT + GATE_ABOVE;
  // The sprite is drawn about its middle: raised by half its height it stands on the tile's foot.
  const rest = span > 0 ? h / 2 - 1 : 0;
  const gate: Entity = {
    position: { x: tx * TILE_WIDTH + TILE_WIDTH / 2, y: (ty + 1) * TILE_HEIGHT - 1 },
    yOffset: rest + lift * GATE_RISE,
    gate: dropping ? { lift, dropping, rest } : { lift, rest },
  };
  if (span > 0) gate.visual = { sheet: 'portcullis', size: { w: TILE_WIDTH, h } };
  return world.add(gate);
}

/** The lever beside the safe room's door; pulling it (E) raises the portcullis. The exit room's (`exit`) drops its own. */
export function createLever(x: number, y: number, exit = false): Entity {
  return world.add({
    position: { x, y },
    lever: exit ? { pulled: false, rest: 0, exit } : { pulled: false, rest: 0 },
    visual: { sheet: 'lever', col: 0, row: 0 },
    radius: { x: 8, y: 6 },
    yOffset: 8,
  });
}

/**
 * A torch hung on a brick face. The entity stands at the foot of the wall (so anyone in front of the
 * wall draws over it); the sprite is lifted up onto the bricks, sparks flying up from its flame.
 */
export function createTorch(x: number, y: number): Entity {
  return world.add({
    position: { x, y: y + TORCH_LIFT },
    torch: { radius: TORCH_LIGHT_RADIUS, color: TORCH_COLOR, flicker: Math.random() * Math.PI * 2 },
    sparks: { effect: 'torch-sparks', lift: TORCH_LIFT + TORCH_FLAME_RISE * TORCH_SCALE },
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

/**
 * A castle's wall candle (light B), where the catacombs would have a torch: its flame at (x, y), giving light like a
 * torch's, with the candle on its bracket below it.
 */
export function createSconce(x: number, y: number): Entity {
  const sheet = 'prop_castle_sconce';
  const below = (PROPS.castle_sconce.rect.h / 2 - SCONCE_FLAME_DROP) * SCONCE_SCALE;
  return world.add({
    position: { x, y: y + TORCH_LIFT },
    torch: { radius: SCONCE_LIGHT_RADIUS, color: TORCH_COLOR, flicker: Math.random() * Math.PI * 2 },
    visual: { sheet, scale: SCONCE_SCALE },
    animation: {
      sheet, frameX: Math.floor(Math.random() * SCONCE_FRAMES), frameY: 0, frameCount: SCONCE_FRAMES,
      frameTime: SCONCE_FRAME_TICKS, timer: 0, loop: true,
    },
    yOffset: TORCH_LIFT - below,
    localOnly: true,
  });
}

/** A campfire on its (blocked) tile, on a hearth of flagstones, smoke curling up and sparks flying from its flames, embers popping out onto the hearth. */
export function createCampfire(x: number, y: number): Entity {
  world.add({ position: { x, y: y + HEARTH_DROP }, visual: { sheet: 'campfire_floor' }, flat: true, localOnly: true });
  createSmoke(x, y, CAMPFIRE_SMOKE);
  return world.add({
    position: { x, y },
    visual: { sheet: 'campfire', scale: CAMPFIRE_SCALE },
    animation: {
      sheet: 'campfire', frameX: 0, frameY: 0, frameCount: CAMPFIRE_FRAMES, frameTime: CAMPFIRE_FRAME_TICKS,
      timer: Math.floor(Math.random() * CAMPFIRE_FRAME_TICKS), loop: true,
    },
    glow: { radius: CAMPFIRE_LIGHT_RADIUS, flicker: Math.random() * Math.PI * 2 },
    sparks: { effect: 'campfire-embers', lift: CAMPFIRE_LIFT + CAMPFIRE_FLAME_RISE * CAMPFIRE_SCALE },
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

/**
 * The light a prop gives off, if any: firelight (candles, candelabras, braziers) or a lantern's flame, flickering out of
 * step with every other, or a crystal's steady cold shine.
 */
function propGlow(def: PropDef): Pick<Entity, 'glow'> {
  if (!def.glow) return {};
  const flickers = !def.coolGlow || def.flame === true;
  return { glow: { radius: def.glow, cool: def.coolGlow, flicker: flickers ? Math.random() * Math.PI * 2 : undefined } };
}

/** A decorative prop: standing on its tile, or hung on the brick face above it. */
export function createProp(p: PropPlacement): Entity {
  const def: PropDef = PROPS[p.kind];
  const sheet = `prop_${p.kind}`;
  const x = p.tx * TILE_WIDTH + TILE_WIDTH / 2 + (p.dx ?? 0);
  const h = def.rect.h;
  if (def.mount === 'wall') {
    // Stands at the foot of the wall like a torch, drawn up on the bricks.
    return world.add({
      position: { x, y: p.ty * TILE_HEIGHT }, visual: { sheet }, yOffset: (def.hang ?? HANG_TOP) - h / 2, localOnly: true, ...propGlow(def),
    });
  }
  if (def.mount === 'foot') {
    if (def.backing) {
      const back = def.backing;
      world.add({
        position: { x, y: p.ty * TILE_HEIGHT + FOOT_DEPTH - BEHIND }, visual: { sheet: `${sheet}_backing` },
        yOffset: back.lift + back.rect.h / 2 - BEHIND, localOnly: true,
      });
    }
    if (def.fire) {
      const fire = def.fire;
      fire.at.forEach((dx, i) => createWindowFire(x + dx, p.ty * TILE_HEIGHT + FOOT_DEPTH - BEHIND / 2, fire.rise - BEHIND / 2, i === 0));
    }
    return world.add({
      ...(def.smoke ? { mist: true } : {}),
      position: { x, y: p.ty * TILE_HEIGHT + FOOT_DEPTH }, visual: { sheet }, yOffset: h / 2, localOnly: true,
      ...propAnimation(sheet, def), ...propGlow(def),
    });
  }
  if (def.mount === 'front') {
    return world.add({
      position: { x, y: p.ty * TILE_HEIGHT + PROP_GROUND + FRONT_BIAS }, visual: { sheet }, yOffset: FRONT_TOP - h / 2, localOnly: true,
    });
  }
  if (def.flat) {
    // A rug lies centred on its tile, under everything.
    return world.add({ position: { x, y: p.ty * TILE_HEIGHT + TILE_HEIGHT / 2 }, visual: { sheet }, flat: true, localOnly: true });
  }
  return world.add({
    position: { x, y: p.ty * TILE_HEIGHT + PROP_GROUND },
    visual: { sheet },
    yOffset: h / 2,
    localOnly: true,
    ...propAnimation(sheet, def),
    ...propGlow(def),
    ...(def.seeThrough ? { seeThrough: true } : {}),
  });
}

/**
 * The floor things that can be opened or searched, by what they are: coffins and sarcophagi still shut, barrels,
 * crates and boxes, urns, vases and jars, and sacks. (Open bowls, broken or spilt things, racks, shelves
 * and whatever hangs on a wall, such as the cauldrons, are not.) What each holds, if anything, is rolled by `stashCoins`.
 */
const OPENABLE_PROPS: ReadonlySet<PropKind> = new Set<PropKind>([
  'coffin', 'coffin_cracked', 'coffin_open', 'sarcophagus', 'sarcophagus2', 'sarcophagus_open', 'sarcophagus_open2',
  'sarcophagus_broken', 'sarcophagus_broken2',
  'barrel', 'barrel2', 'supplies_barrel',
  'crate', 'crate2', 'crate_large', 'crate_large2', 'supplies_crate', 'supplies_crates',
  'urn', 'urn_small', 'urn_m', 'urn_s', 'urn_xs', 'urn_green', 'urn_green_small', 'urn_green_m', 'urn_green_s', 'urn_green_xs',
  'supplies_vase', 'supplies_jar',
  'castle_barrel', 'castle_bucket', 'castle_chests', 'castle_urn', 'castle_urn_m', 'castle_pot', 'castle_pot_m',
  'iso_pot_red', 'iso_pot_green', 'iso_pot_violet',
  'sack', 'sack_m', 'sack_s', 'sack_xs', 'sack2', 'sack2_m', 'sack2_s', 'sack2_xs', 'sacks_pile', 'sacks_pile2', 'sacks_pile3',
]);
/** A stash's body reaches this far up and down its prop's foot, for the crosshair and the corner brackets. */
const STASH_DEPTH = 6;

/** Coffins and sarcophagi: searched, they may give up what their dead were buried with. */
function isTomb(kind: PropKind): boolean {
  return COFFINS.includes(kind) || SARCOPHAGI.includes(kind);
}

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
    stash: { coins: stashCoins(), gear: isTomb(p.kind) && Math.random() < TOMB_GEAR_CHANCE },
  });
}

/**
 * The chests (public/castle-izometric/chest_keys_treasure.png, cells of 32×48, in every theme): a row per tier
 * (Drops.ts CHEST_TIERS), and in each the chest facing four ways, each closed and open (the columns of each).
 */
const ISO_CHEST_FACINGS = [{ closed: 0, open: 1 }, { closed: 2, open: 3 }, { closed: 5, open: 4 }, { closed: 7, open: 6 }] as const;
const ISO_CHEST_SCALE = 0.8;
/** Its art stands on the foot of its cell, drawn about its middle: raised by half the cell, less a little to stand on its body. */
const ISO_CHEST_LIFT = 17;

/** What a chest holds and how it looks. */
type ChestLook = Pick<Required<Entity>, 'chest' | 'visual' | 'yOffset'>;

/** A chest (in every theme): a tier rolled by its rarity (its row of the sheet), facing any of its four ways. */
export function isoChest(): ChestLook {
  const tier = rollChestTier();
  const facing = ISO_CHEST_FACINGS[Math.floor(Math.random() * ISO_CHEST_FACINGS.length)];
  return {
    chest: { opened: false, disappearTicks: -1, drops: CHEST_TIERS[tier].drops, ...facing },
    visual: { sheet: 'iso_chests', col: facing.closed, row: tier, scale: ISO_CHEST_SCALE },
    yOffset: ISO_CHEST_LIFT,
  };
}

/** A chest on the floor at (x, y), opened with "use" (systems/ChestSystem.ts). */
export function createChest(x: number, y: number, look: ChestLook = isoChest()): Entity {
  return world.add({
    position: { x, y },
    ...look,
    health: { current: CHEST_HEALTH, max: CHEST_HEALTH },
    hurtTime: 0, freezeTime: 0,
    radius: { x: 7, y: 4 },
    blocking: true,
    physicsSlide: true,
    healthBarOffset: 14,
    minimapColor: 0xffd040,
  });
}

/** The dummy is drawn half as big again; its feet are 28 px down its 32 px frame. */
const DUMMY_SCALE = 1.5;
const DUMMY_FEET_Y = 28;
const DUMMY_FRAME = 32;
const DUMMY_FRAME_TICKS = 6;
/** Health only for show: the dummy is healed after every blow. */
const DUMMY_HEALTH = 1000;

/** How the training dummy is drawn (the illusionist's dummy wears the same, entities/SummonFactory.ts). */
export function dummyLook(): Pick<Entity, 'visual' | 'animation' | 'yOffset'> {
  return {
    visual: { sheet: 'training_dummy', scale: DUMMY_SCALE },
    // At rest it stands still on the first frame (its strips are all hits, systems/DummySystem.ts).
    animation: { sheet: 'training_dummy', frameX: 0, frameY: 0, frameCount: 1, frameTime: DUMMY_FRAME_TICKS, timer: 0, loop: true },
    yOffset: (DUMMY_FEET_Y - DUMMY_FRAME / 2) * DUMMY_SCALE,
  };
}

/** How high over its middle the dummy's head reaches (px), for a health bar over it. */
export const DUMMY_HEAD = DUMMY_FEET_Y * DUMMY_SCALE;

/** The training dummy in the safe room: swords, spells and arrows can be tried on it. */
export function createTrainingDummy(x: number, y: number): Entity {
  return world.add({
    position: { x, y },
    health: { current: DUMMY_HEALTH, max: DUMMY_HEALTH },
    hurtTime: 0, freezeTime: 0,
    radius: { x: 10, y: 6 },
    blocking: true,
    team: Team.Neutral,
    dummy: { row: DUMMY_STILL },
    ...dummyLook(),
  });
}

/**
 * The way on: the dark portal in the exit room's north wall (its arch is decor, the `portal_dark` prop), whose foot is at
 * (x, y). Using it asks the heroes in the room whether to go deeper (systems/ExitSystem.ts). It has no picture of its
 * own: its body spans the arch, so the corner brackets frame the arch and the crosshair finds it anywhere on it.
 */
export function createExitButton(x: number, y: number): Entity {
  const arch = PROPS.portal_dark.rect;
  return world.add({
    position: { x, y: y + FOOT_DEPTH },
    exitButton: { activated: false, choices: {}, outcome: null },
    radius: { x: arch.w / 2, y: PORTAL_DEPTH },
    yOffset: arch.h / 2,
    minimapColor: 0x00ff44,
  });
}

/** A spike trap in a corridor's floor, at the middle of its tile (systems/TrapSystem.ts): holes until it is sprung. */
export function createSpikeTrap(x: number, y: number): Entity {
  return world.add({
    position: { x, y },
    spikeTrap: { sprung: false, ticks: 0 },
    visual: { sheet: 'spikes', col: 0, row: 0 },
    flat: true,
  });
}

/** The trader of the safe room (entities/Trader.ts): it stands on its feet at (x, y), animated by systems/TraderSystem.ts. */
export function createShopNpc(x: number, y: number): Entity {
  return world.add({
    position: { x, y },
    shopNpc: { items: SHOP_ITEMS.map((item) => ({ ...item })), resale: [], gold: TRADER_GOLD },
    radius: { x: 10, y: 10 },
    blocking: true,
    visual: { sheet: TRADER_SHEETS.idle, col: 0, row: 0, scale: TRADER_SCALE },
    // The sprite is drawn about its middle: raised by half its height, its feet stand on its position.
    yOffset: (TRADER_FRAME * TRADER_SCALE) / 2,
    minimapColor: 0xffaa00,
  });
}
