/** Populates the ECS world from a DungeonLayout produced by DungeonBuilder.
 *  Entities come from the factories, so DungeonBuilder stays pure/reusable.
 */

import type { MobType } from '../../world';
import { TILE_WIDTH, TILE_HEIGHT, TileType } from '../TileType';
import { createMob } from '../../entities/MobFactory';
import { depthWeight, enemyCountScale } from '../../game/Difficulty';
import {
  createCampfire, createChest, createSpikeTrap, createExitButton, createExitDoor, createProp, createRoom, createLever, createSafeDoor, createShopNpc, createStash,
  createSconce, createTorch, createTrainingDummy,
} from '../../entities/DungeonFactory';
import type { Level } from '../Level';
import { forEachTile } from '../Grid';
import type { DungeonLayout, RoomData } from './DungeonBuilder';
import type { DungeonConfig } from './DungeonConfig';

/**
 * How often each kind of enemy turns up in a dungeon room, relative to the others: the old goblins and
 * orcs alongside the three goblins from /other-orcs (grunts most often, warriors least), and now and then
 * a ghost wizard or, rarely, an evil wizard.
 */
const ENEMY_MIX = [
  { type: 'goblin', weight: 3 },
  { type: 'orc', weight: 1.3 },
  { type: 'goblin_grunt', weight: 3 },
  { type: 'goblin_rogue', weight: 2 },
  { type: 'goblin_warrior', weight: 1.2 },
  { type: 'ghost_wizard', weight: 0.8 },
  { type: 'evil_wizard', weight: 0.4 },
] as const satisfies ReadonlyArray<{ type: MobType; weight: number }>;
/** The isometric castle is haunted by its own: shades drifting about, and now and then a grick. */
const ISO_ENEMY_MIX = [
  { type: 'shade', weight: 3 },
  { type: 'grick', weight: 1 },
] as const satisfies ReadonlyArray<{ type: MobType; weight: number }>;

type EnemyMix = ReadonlyArray<{ type: MobType; weight: number }>;
/** Chance a dungeon room holds a chest. */
const CHEST_CHANCE = 0.4;

type FloorSpot = { tx: number; ty: number; x: number; y: number };

/** A kind of enemy drawn from a mix by weight, each weighed again by how common it is at this depth (game/Difficulty.ts). */
function randomEnemy(mix: EnemyMix): MobType {
  const weightOf = (entry: EnemyMix[number]) => entry.weight * depthWeight(entry.type);
  let roll = Math.random() * mix.reduce((sum, e) => sum + weightOf(e), 0);
  for (const entry of mix) {
    roll -= weightOf(entry);
    if (roll < 0) return entry.type;
  }
  return mix[0].type;
}

/** Walkable floor tiles inside a room (pits and pillar blocks excluded). */
function floorTilesIn(level: Level, room: RoomData): FloorSpot[] {
  const out: FloorSpot[] = [];
  forEachTile(room.x, room.y, room.x + room.w - 1, room.y + room.h - 1, (tx, ty) => {
    if (level.getTile(tx, ty)?.type !== TileType.Floor || level.bridges.has(tx + ty * level.width)) return;
    out.push({ tx, ty, x: tx * TILE_WIDTH + TILE_WIDTH / 2, y: ty * TILE_HEIGHT + TILE_HEIGHT / 2 });
  });
  return out;
}

/** Enemies and maybe a chest on a dungeon room's free floor (loot only drops from what you kill). */
function populateRoom(level: Level, room: RoomData, cfg: DungeonConfig): void {
  const floors = floorTilesIn(level, room);
  if (floors.length === 0) return;
  const pick = () => floors.splice(Math.floor(Math.random() * floors.length), 1)[0];

  // More the deeper the party goes, and the more heroes there are (game/Difficulty.ts).
  const enemyCount = Math.max(1, Math.round((floors.length * cfg.enemyDensity / 100) * enemyCountScale()));
  const mix = level.theme === 'castle2' ? ISO_ENEMY_MIX : ENEMY_MIX;
  for (let i = 0; i < enemyCount && floors.length; i++) {
    const t = pick();
    createMob(level, randomEnemy(mix), t.x, t.y);
  }

  if (Math.random() < CHEST_CHANCE && floors.length) {
    const spot = pick();
    // Some chests are rarer than others (entities/Drops.ts CHEST_TIERS).
    createChest(spot.x, spot.y);
  }
}

/** Decor every browser builds for itself from the seeded layout: rooms, torches, props and campfires. */
export function spawnDecor(layout: DungeonLayout): void {
  for (const room of layout.rooms) createRoom(room);
  // A castle is lit by wall candles where the catacombs have torches.
  const light = layout.level.theme === 'castle' ? createSconce : createTorch;
  for (const tp of layout.torchPositions) light(tp.x, tp.y);
  for (const p of layout.props) createProp(p);
  for (const c of layout.campfires) createCampfire(c.x, c.y);
}

/** What changes during play, made by whoever runs the game (alone, or the co-op host). */
export function spawnLiveEntities(layout: DungeonLayout, cfg: DungeonConfig): void {
  const { level, rooms, exitButtonPos, shopPos, safeDoor, dummyPos, leverPos, exitDoor, exitLeverPos, props } = layout;
  createSafeDoor(safeDoor, level);
  createLever(leverPos.x, leverPos.y);
  createExitDoor(exitDoor);
  createLever(exitLeverPos.x, exitLeverPos.y, true);
  for (const room of rooms) {
    if (room.type === 'dungeon') populateRoom(level, room, cfg);
  }
  createExitButton(exitButtonPos.x, exitButtonPos.y);
  for (const s of layout.spikes) createSpikeTrap(s.x, s.y);
  createShopNpc(shopPos.x, shopPos.y);
  createTrainingDummy(dummyPos.x, dummyPos.y);
  // The safe room is where the party gathers and sets out: nothing in it is there to be searched.
  for (const p of props) if (!level.isSafeZone(p.tx, p.ty)) createStash(p);
}
