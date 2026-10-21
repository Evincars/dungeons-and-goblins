/** Populates the ECS world from a DungeonLayout produced by DungeonBuilder.
 *  Entities come from the factories, so DungeonBuilder stays pure/reusable.
 */

import type { MobType } from '../../world';
import { TILE_WIDTH, TILE_HEIGHT, TileType } from '../TileType';
import { createMob } from '../../entities/MobFactory';
import {
  createChest, createExitButton, createProp, createRoom, createSafeDoor, createShopNpc, createTorch,
} from '../../entities/DungeonFactory';
import type { Level } from '../Level';
import { forEachTile } from '../Grid';
import type { DungeonLayout, RoomData } from './DungeonBuilder';
import type { DungeonConfig } from './DungeonConfig';

/** Share of dungeon enemies that are goblins; the rest are orcs. */
const GOBLIN_SHARE = 0.7;
/** Chance a dungeon room holds a chest. */
const CHEST_CHANCE = 0.4;

type FloorSpot = { tx: number; ty: number; x: number; y: number };

/** Walkable floor tiles inside a room (pits and pillar blocks excluded). */
function floorTilesIn(level: Level, room: RoomData): FloorSpot[] {
  const out: FloorSpot[] = [];
  forEachTile(room.x, room.y, room.x + room.w - 1, room.y + room.h - 1, (tx, ty) => {
    if (level.getTile(tx, ty)?.type !== TileType.Floor) return;
    out.push({ tx, ty, x: tx * TILE_WIDTH + TILE_WIDTH / 2, y: ty * TILE_HEIGHT + TILE_HEIGHT / 2 });
  });
  return out;
}

/** Enemies and maybe a chest on a dungeon room's free floor (loot only drops from what you kill). */
function populateRoom(level: Level, room: RoomData, cfg: DungeonConfig): void {
  const floors = floorTilesIn(level, room);
  if (floors.length === 0) return;
  const pick = () => floors.splice(Math.floor(Math.random() * floors.length), 1)[0];

  const enemyCount = Math.max(1, Math.round(floors.length * cfg.enemyDensity / 100));
  for (let i = 0; i < enemyCount && floors.length; i++) {
    const t = pick();
    const type: MobType = Math.random() < GOBLIN_SHARE ? 'goblin' : 'orc';
    createMob(level, type, t.x, t.y);
  }

  if (Math.random() < CHEST_CHANCE && floors.length) {
    const spot = pick();
    createChest(spot.x, spot.y);
  }
}

/** Decor every browser builds for itself from the seeded layout: rooms, torches and props. */
export function spawnDecor(layout: DungeonLayout): void {
  for (const room of layout.rooms) createRoom(room);
  for (const tp of layout.torchPositions) createTorch(tp.x, tp.y);
  for (const p of layout.props) createProp(p);
}

/** What changes during play, made by whoever runs the game (alone, or the co-op host). */
export function spawnLiveEntities(layout: DungeonLayout, cfg: DungeonConfig): void {
  const { level, rooms, exitButtonPos, shopPos, safeDoor } = layout;
  createSafeDoor(safeDoor);
  for (const room of rooms) {
    if (room.type === 'dungeon') populateRoom(level, room, cfg);
  }
  createExitButton(exitButtonPos.x, exitButtonPos.y);
  createShopNpc(shopPos.x, shopPos.y);
}
