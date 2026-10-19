/** Populates the ECS world from a DungeonLayout produced by DungeonBuilder.
 *  All world.add() calls live here so DungeonBuilder stays pure/reusable.
 */

import { world } from '../../world';
import type { InventoryItem } from '../../world';
import { TILE_WIDTH, TILE_HEIGHT, TileType } from '../TileType';
import { createMob } from '../../entities/MobFactory';
import type { Level } from '../Level';
import type { DungeonLayout, RoomData } from './DungeonBuilder';
import type { DungeonConfig } from './DungeonConfig';
import { PROPS } from '../Props';
import type { PropDef, PropPlacement } from '../Props';

/** Torch mounts sit this far above the foot of their wall. */
const TORCH_LIFT = 30;

type FloorSpot = { tx: number; ty: number; x: number; y: number };

/** Walkable floor tiles inside a room (pits and pillar blocks excluded). */
function floorTilesIn(level: Level, room: RoomData): FloorSpot[] {
  const out: FloorSpot[] = [];
  for (let ty = room.y; ty < room.y + room.h; ty++) {
    for (let tx = room.x; tx < room.x + room.w; tx++) {
      if (level.getTile(tx, ty)?.type !== TileType.Floor) continue;
      out.push({ tx, ty, x: tx * TILE_WIDTH + TILE_WIDTH / 2, y: ty * TILE_HEIGHT + TILE_HEIGHT / 2 });
    }
  }
  return out;
}

/** Floor props rest just above their tile's bottom edge, so they depth-sort with whoever stands around them. */
const PROP_GROUND = TILE_HEIGHT - 4;
/** Wall props hang from just under the face's cap molding. */
const HANG_TOP = 58;

function spawnProp(p: PropPlacement): void {
  const def: PropDef = PROPS[p.kind];
  const x = p.tx * TILE_WIDTH + TILE_WIDTH / 2;
  const h = def.rect.h;
  if (def.mount === 'wall') {
    // Stands at the foot of the wall like a torch, drawn up on the bricks.
    world.add({ position: { x, y: p.ty * TILE_HEIGHT }, visual: { sheet: `prop_${p.kind}` }, yOffset: HANG_TOP - h / 2 });
    return;
  }
  world.add({
    position: { x, y: p.ty * TILE_HEIGHT + PROP_GROUND },
    visual: { sheet: `prop_${p.kind}` },
    yOffset: h / 2,
    ...(def.glow ? { glow: { radius: def.glow } } : {}),
  });
}

export function spawnDungeonEntities(layout: DungeonLayout, cfg: DungeonConfig): void {
  const { level, rooms, torchPositions, exitButtonPos, shopPos, safeDoor } = layout;

  // ── Safe-room door ──────────────────────────────────────────────────────────
  const firstDoor = safeDoor.tiles[0];
  world.add({
    position: {
      x: firstDoor.x * TILE_WIDTH + TILE_WIDTH / 2,
      y: (safeDoor.tiles[Math.floor(safeDoor.tiles.length / 2)] ?? firstDoor).y * TILE_HEIGHT + TILE_HEIGHT / 2,
    },
    door: { tiles: safeDoor.tiles, boundaryX: safeDoor.boundaryX, closed: false },
  });

  // ── Room entities (ECS metadata) ──────────────────────────────────────────
  for (const room of rooms) {
    world.add({
      room: {
        id: room.id,
        type: room.type,
        bounds: { x: room.x, y: room.y, w: room.w, h: room.h },
      },
    });
  }

  // ── Torches, hung on brick faces ──────────────────────────────────────────
  // The entity stands at the foot of the wall (so anyone in front of the wall
  // draws over it); the sprite is lifted up onto the bricks.
  for (const tp of torchPositions) {
    world.add({
      position: { x: tp.x, y: tp.y + TORCH_LIFT },
      torch: { radius: 120, color: 0xffcc66, flicker: Math.random() * Math.PI * 2 },
      visual: { sheet: 'torch', scale: 1.5 },
      animation: {
        sheet: 'torch',
        frameX: 0,
        frameY: 0,
        frameCount: 4,
        frameTime: 7,
        timer: Math.floor(Math.random() * 4),
        loop: true,
      },
      yOffset: TORCH_LIFT,
    });
  }

  // ── Props: coffins, crates, urns and candles on the floor, hangings on faces ──
  for (const p of layout.props) spawnProp(p);

  // ── Enemies and chests in dungeon rooms (loot only drops from what you kill) ──
  const dungeonRooms = rooms.filter(r => r.type === 'dungeon');
  const rng = Math.random;

  for (const room of dungeonRooms) {
    const floors = floorTilesIn(level, room);
    if (floors.length === 0) continue;
    const pick = () => floors.splice(Math.floor(rng() * floors.length), 1)[0];
    const area = floors.length;

    const enemyCount = Math.max(1, Math.round(area * cfg.enemyDensity / 100));
    for (let i = 0; i < enemyCount && floors.length; i++) {
      const t = pick();
      createMob(level, rng() < 0.7 ? 'goblin' : 'orc', t.x, t.y);
    }

    // Chest — 40% chance per room
    if (rng() < 0.4 && floors.length) {
      const { x: cx, y: cy } = pick();
      world.add({
        position: { x: cx, y: cy },
        chest: { opened: false, disappearTicks: -1 },
        health: { current: 20, max: 20 },
        hurtTime: 0, freezeTime: 0,
        radius: { x: 12, y: 10 },
        blocking: true,
        physicsSlide: true,
        visual: { sheet: 'chest', col: 0, row: 0 },
        yOffset: 8,
        healthBarOffset: 14,
        minimapColor: 0xffd040,
      });
    }
  }

  // ── Exit button ───────────────────────────────────────────────────────────
  world.add({
    position: { x: exitButtonPos.x, y: exitButtonPos.y },
    exitButton: { activated: false },
    radius: { x: 14, y: 12 },
    visual: { sheet: 'exit_button', col: 0, row: 0 },
    yOffset: 16,
    minimapColor: 0x00ff44,
  });

  // ── Shop NPC in safe room ─────────────────────────────────────────────────
  world.add({
    position: { x: shopPos.x, y: shopPos.y },
    shopNpc: {
      items: buildShopInventory(),
    },
    radius: { x: 10, y: 10 },
    blocking: true,
    visual: { sheet: 'spawner', col: 0, row: 0 },
    yOffset: 8,
    minimapColor: 0xffaa00,
  });
}


function buildShopInventory(): InventoryItem[] {
  return [
    { type: 'weapon', name: 'Short Sword',  value: 50,  slot: 'weapon', icon: 0, stats: { attack: 2 } },
    { type: 'weapon', name: 'Long Sword',   value: 120, slot: 'weapon', icon: 0, stats: { attack: 4 } },
    { type: 'helmet', name: 'Iron Helm',    value: 40,  slot: 'helmet', icon: 1, stats: { defense: 1 } },
    { type: 'chest',  name: 'Chain Mail',   value: 80,  slot: 'chest',  icon: 2, stats: { defense: 2 } },
    { type: 'boots',  name: 'Leather Boots',value: 30,  slot: 'boots',  icon: 4, stats: { defense: 1 } },
    { type: 'health_potion', name: 'Health Potion', value: 20, icon: 6, stats: { hp: 30 } },
    { type: 'health_potion', name: 'Big Potion',    value: 50, icon: 6, stats: { hp: 80 } },
  ];
}
