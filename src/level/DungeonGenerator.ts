import { Level } from './Level';
import { TileType, TILE_WIDTH, TILE_HEIGHT, createTile } from './TileType';
import { world, Team } from '../world';
import { DUNGEON_MAP, MAP_W, MAP_H } from './DungeonMap';
import { createMob } from '../entities/MobFactory';

export type DungeonSpawns = {
  playerSpawn: { x: number; y: number };
  torchPositions: Array<{ x: number; y: number }>;
};

export function buildDungeon(): { level: Level; spawns: DungeonSpawns } {
  const level = new Level(MAP_W, MAP_H);
  let playerSpawn = { x: TILE_WIDTH * 2 + 16, y: TILE_HEIGHT * 2 + 16 };
  const torchPositions: Array<{ x: number; y: number }> = [];

  for (let row = 0; row < MAP_H; row++) {
    const line = DUNGEON_MAP[row] ?? '';
    for (let col = 0; col < MAP_W; col++) {
      const cell = (line[col] ?? 'W') as string;
      const wx = col * TILE_WIDTH + TILE_WIDTH / 2;
      const wy = row * TILE_HEIGHT + TILE_HEIGHT / 2;

      // Set tile
      switch (cell) {
        case 'W':
          level.setTile(col, row, createTile(TileType.Wall, Math.floor(Math.random() * 4)));
          break;
        case 'B':
          level.setTile(col, row, createTile(TileType.BreakableWall, Math.floor(Math.random() * 2)));
          break;
        case 'H':
          level.setTile(col, row, createTile(TileType.Hole, 0));
          break;
        default:
          level.setTile(col, row, createTile(TileType.Floor, Math.floor(Math.random() * 4)));
          break;
      }

      // Entities
      switch (cell) {
        case 'P':
          playerSpawn = { x: wx, y: wy };
          level.addSpawnPoint(wx, wy);
          break;

        case 't':
          torchPositions.push({ x: wx, y: wy });
          world.add({
            position: { x: wx, y: wy },
            torch: { radius: 90, color: 0xffcc66, flicker: Math.random() * Math.PI * 2 },
            visual: { sheet: 'torch_sheet', col: 0 },
            animation: { sheet: 'torch_sheet', frameX: 0, frameY: 0, frameCount: 4, frameTime: 6, timer: 0, loop: true },
            yOffset: 16,
          });
          break;

        case 'C':
          world.add({
            position: { x: wx, y: wy },
            chest: { opened: false, disappearTicks: -1 },
            health: { current: 20, max: 20 },
            radius: { x: 12, y: 10 },
            blocking: true,
            physicsSlide: true,
            visual: { sheet: 'chest', col: 0, row: 0 },
            yOffset: 8,
            healthBarOffset: 14,
            minimapColor: 0xffd040,
          });
          break;

        case 'i':
          spawnPickup(wx, wy);
          break;

        case 'G':
          world.add({
            position: { x: wx, y: wy },
            spawner: { mobType: 'goblin', interval: 300, timer: 60, spawnCount: 0, maxSpawns: 999 },
            health: { current: 30, max: 30 },
            hurtTime: 0, freezeTime: 0,
            radius: { x: 14, y: 12 },
            blocking: true,
            physicsSlide: true,
            visual: { sheet: 'spawner', col: 0, row: 0 },
            yOffset: 8,
            healthBarOffset: 14,
            minimapColor: 0xff4040,
          });
          break;

        case 'S':
          world.add({
            position: { x: wx, y: wy },
            spawner: { mobType: 'skeleton', interval: 360, timer: 120, spawnCount: 0, maxSpawns: 999 },
            health: { current: 30, max: 30 },
            hurtTime: 0, freezeTime: 0,
            radius: { x: 14, y: 12 },
            blocking: true,
            physicsSlide: true,
            visual: { sheet: 'spawner', col: 1, row: 0 },
            yOffset: 8,
            healthBarOffset: 14,
            minimapColor: 0xff4040,
          });
          break;

        case 'O':
          world.add({
            position: { x: wx, y: wy },
            spawner: { mobType: 'orc', interval: 480, timer: 200, spawnCount: 0, maxSpawns: 999 },
            health: { current: 40, max: 40 },
            hurtTime: 0, freezeTime: 0,
            radius: { x: 14, y: 12 },
            blocking: true,
            physicsSlide: true,
            visual: { sheet: 'spawner', col: 2, row: 0 },
            yOffset: 8,
            healthBarOffset: 14,
            minimapColor: 0xff4040,
          });
          break;

        case 'K':
          // Boss troll — spawn directly
          createMob(level, 'troll', wx, wy);
          break;
      }
    }
  }

  return { level, spawns: { playerSpawn, torchPositions } };
}

function spawnPickup(wx: number, wy: number): void {
  const roll = Math.random();
  if (roll < 0.4) {
    // Health potion
    world.add({
      position: { x: wx, y: wy },
      item: { type: 'health_potion', name: 'Health Potion', value: 30 },
      radius: { x: 6, y: 6 },
      visual: { sheet: 'pickup_potion', col: 0, row: 0 },
      yOffset: 8,
      minimapColor: 0xff2050,
    });
  } else if (roll < 0.7) {
    // Sword scroll
    world.add({
      position: { x: wx, y: wy },
      item: { type: 'sword_scroll', name: 'Sword Upgrade', value: 1 },
      radius: { x: 6, y: 6 },
      visual: { sheet: 'pickup_gem', col: 0, row: 0 },
      yOffset: 8,
      minimapColor: 0xd0d0ff,
    });
  } else {
    // Armor piece
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
