/** Populates the ECS world from a DungeonLayout produced by DungeonBuilder.
 *  All world.add() calls live here so DungeonBuilder stays pure/reusable.
 */

import { world } from '../../world';
import type { InventoryItem } from '../../world';
import { TILE_WIDTH, TILE_HEIGHT } from '../TileType';
import { createMob } from '../../entities/MobFactory';
import type { DungeonLayout } from './DungeonBuilder';
import type { DungeonConfig } from './DungeonConfig';

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

  // ── Torches ───────────────────────────────────────────────────────────────
  for (const tp of torchPositions) {
    world.add({
      position: { x: tp.x, y: tp.y },
      torch: { radius: 110, color: 0xffcc66, flicker: Math.random() * Math.PI * 2 },
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
      yOffset: 12,
    });
  }

  // ── Enemy spawners in dungeon rooms ───────────────────────────────────────
  const dungeonRooms = rooms.filter(r => r.type === 'dungeon');
  const rng = Math.random;

  for (const room of dungeonRooms) {
    const area = room.w * room.h;
    const enemyCount = Math.max(1, Math.round(area * cfg.enemyDensity / 100));

    for (let i = 0; i < enemyCount; i++) {
      const ex = (room.x + 1 + Math.floor(rng() * (room.w - 2))) * TILE_WIDTH + TILE_WIDTH / 2;
      const ey = (room.y + 1 + Math.floor(rng() * (room.h - 2))) * TILE_HEIGHT + TILE_HEIGHT / 2;
      const mobType = rng() < 0.7 ? 'goblin' : 'orc';
      createMob(level, mobType, ex, ey);
    }

    // Items
    const itemCount = Math.max(0, Math.round(area * cfg.itemDensity / 100));
    for (let i = 0; i < itemCount; i++) {
      const ix = (room.x + 1 + Math.floor(rng() * (room.w - 2))) * TILE_WIDTH + TILE_WIDTH / 2;
      const iy = (room.y + 1 + Math.floor(rng() * (room.h - 2))) * TILE_HEIGHT + TILE_HEIGHT / 2;
      spawnItem(ix, iy);
    }

    // Decorative pots along the room (non-blocking visual flavour)
    const potCount = Math.round(rng() * 3);
    for (let i = 0; i < potCount; i++) {
      const dx = (room.x + 1 + Math.floor(rng() * (room.w - 2))) * TILE_WIDTH + TILE_WIDTH / 2;
      const dy = (room.y + 1 + Math.floor(rng() * (room.h - 2))) * TILE_HEIGHT + TILE_HEIGHT / 2;
      world.add({
        position: { x: dx, y: dy },
        visual: { sheet: rng() < 0.5 ? 'decor_pot1' : 'decor_pot2', scale: 1.4 },
        yOffset: 10,
      });
    }

    // Chest — one per room, 40% chance
    if (rng() < 0.4) {
      const cx = (room.x + Math.floor(room.w / 2)) * TILE_WIDTH + TILE_WIDTH / 2;
      const cy = (room.y + Math.floor(room.h / 2)) * TILE_HEIGHT + TILE_HEIGHT / 2;
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

function spawnItem(wx: number, wy: number): void {
  const roll = Math.random();
  if (roll < 0.4) {
    world.add({
      position: { x: wx, y: wy },
      item: { type: 'health_potion', name: 'Health Potion', value: 30 },
      radius: { x: 6, y: 6 },
      visual: { sheet: 'pickup_potion', col: 0, row: 0 },
      yOffset: 8,
      minimapColor: 0xff2050,
    });
  } else if (roll < 0.7) {
    world.add({
      position: { x: wx, y: wy },
      item: { type: 'sword_scroll', name: 'Sword Upgrade', value: 1 },
      radius: { x: 6, y: 6 },
      visual: { sheet: 'pickup_gem', col: 0, row: 0 },
      yOffset: 8,
      minimapColor: 0xd0d0ff,
    });
  } else {
    world.add({
      position: { x: wx, y: wy },
      item: { type: 'armor_piece', name: 'Armor Piece', value: 1 },
      radius: { x: 6, y: 6 },
      visual: { sheet: 'pickup_gem', col: 0, row: 0 },
      yOffset: 8,
      minimapColor: 0xc0c0c0,
    });
  }
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
