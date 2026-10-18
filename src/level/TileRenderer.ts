import { Container, Graphics } from 'pixi.js';
import { CompositeTilemap } from '@pixi/tilemap';
import type { Level } from './Level';
import { TileType, TILE_WIDTH, TILE_HEIGHT } from './TileType';
import { getTexture } from '../assets/AssetLoader';
import { frameTexture } from '../render/Sheets';
import { world } from '../world';

const WALL_RISE = 24; // walltiles extend 24px above their tile

export function buildLevelView(level: Level): Container {
  const container = new Container();

  const holes = new Graphics();
  const floors = new CompositeTilemap([getTexture('floortiles').source]);
  const walls = new CompositeTilemap([getTexture('walltiles').source]);
  const bwalls = new CompositeTilemap([getTexture('breakwalls').source]);
  container.addChild(holes, floors, walls, bwalls);

  for (let ty = 0; ty < level.height; ty++) {
    for (let tx = 0; tx < level.width; tx++) {
      const tile = level.getTile(tx, ty);
      if (!tile) continue;

      const wx = tx * TILE_WIDTH;
      const wy = ty * TILE_HEIGHT;

      switch (tile.type) {
        case TileType.Hole:
          holes.rect(wx, wy, TILE_WIDTH, TILE_HEIGHT).fill(0x000000);
          break;

        case TileType.Floor:
          floors.tile(getTexture('floortiles'), wx, wy, {
            u: (tile.imageVariant % 4) * TILE_WIDTH,
            v: 0,
            tileWidth: TILE_WIDTH,
            tileHeight: TILE_HEIGHT,
          });
          break;

        case TileType.Wall:
          // Floor tile under the wall
          floors.tile(getTexture('floortiles'), wx, wy, {
            u: (tile.imageVariant % 4) * TILE_WIDTH, v: 0,
            tileWidth: TILE_WIDTH, tileHeight: TILE_HEIGHT,
          });
          // Wall face drawn above
          walls.tile(frameTexture('walltiles', tile.imageVariant % 4, 0),
            wx, wy - WALL_RISE);
          break;

        case TileType.BreakableWall:
          floors.tile(getTexture('floortiles'), wx, wy, {
            u: (tile.imageVariant % 4) * TILE_WIDTH, v: 0,
            tileWidth: TILE_WIDTH, tileHeight: TILE_HEIGHT,
          });
          bwalls.tile(frameTexture('breakwalls', tile.imageVariant % 2, 0),
            wx, wy - WALL_RISE);
          break;
      }
    }
  }

  return container;
}

/** Spawn wall-tile entities for depth-sorting; walls at y > player.y draw in front. */
export function syncWalls(level: Level): void {
  // Remove old wall entities
  for (const e of world.with('wallTile')) { world.remove(e); }

  for (let ty = 0; ty < level.height; ty++) {
    for (let tx = 0; tx < level.width; tx++) {
      const tile = level.getTile(tx, ty);
      if (tile?.type !== TileType.Wall && tile?.type !== TileType.BreakableWall) continue;

      const sheet = tile.type === TileType.Wall ? 'walltiles' : 'breakwalls';
      world.add({
        position: { x: tx * TILE_WIDTH + TILE_WIDTH / 2, y: ty * TILE_HEIGHT },
        visual: { sheet, col: tile.imageVariant % (tile.type === TileType.Wall ? 4 : 2), row: 0 },
        wallTile: { tileX: tx, tileY: ty },
        yOffset: WALL_RISE,
      });
    }
  }
}

export function resetWalls(): void {
  for (const e of world.with('wallTile')) { world.remove(e); }
}
