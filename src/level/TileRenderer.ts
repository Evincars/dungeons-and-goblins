import { Container, Graphics, Sprite } from 'pixi.js';
import { CompositeTilemap } from '@pixi/tilemap';
import type { Level } from './Level';
import { TileType, TILE_WIDTH, TILE_HEIGHT } from './TileType';
import { getTexture } from '../assets/AssetLoader';
import { frameTexture } from '../render/Sheets';
import { world } from '../world';

const WALL_RISE = 24; // walltiles extend 24px above their tile row

export function buildLevelView(level: Level): Container {
  const container = new Container();
  container.sortableChildren = false;

  // Black fill for holes
  const holes = new Graphics();

  // Floor tiles via CompositeTilemap (single sheet, efficient)
  const floorSheet = getTexture('floortiles');
  const floors = new CompositeTilemap();

  // Wall and breakable wall faces as plain sprites (less tiles, fine as sprites)
  const wallLayer = new Container();

  for (let ty = 0; ty < level.height; ty++) {
    for (let tx = 0; tx < level.width; tx++) {
      const tile = level.getTile(tx, ty);
      if (!tile) continue;

      const wx = tx * TILE_WIDTH;
      const wy = ty * TILE_HEIGHT;

      if (tile.type === TileType.Hole) {
        holes.rect(wx, wy, TILE_WIDTH, TILE_HEIGHT).fill({ color: 0x000000 });
        continue;
      }

      // Floor tile underneath everything
      const fv = tile.imageVariant % 4;
      floors.tile(floorSheet, wx, wy, {
        u: fv * TILE_WIDTH,
        v: 0,
        tileWidth: TILE_WIDTH,
        tileHeight: TILE_HEIGHT,
      });

      if (tile.type === TileType.Wall || tile.type === TileType.BreakableWall) {
        const sheet = tile.type === TileType.Wall ? 'walltiles' : 'breakwalls';
        const col = tile.imageVariant % (tile.type === TileType.Wall ? 4 : 2);
        const s = new Sprite(frameTexture(sheet, col, 0));
        s.x = wx;
        s.y = wy - WALL_RISE;
        wallLayer.addChild(s);
      }
    }
  }

  container.addChild(holes, floors, wallLayer);
  return container;
}

/** Spawn wall-tile entities for depth-sorting; walls at y > player.y draw in front. */
export function syncWalls(level: Level): void {
  for (const e of world.with('wallTile')) world.remove(e);

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
  for (const e of world.with('wallTile')) world.remove(e);
}
