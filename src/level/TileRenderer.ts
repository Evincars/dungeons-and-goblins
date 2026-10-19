import { Container, Graphics } from 'pixi.js';
import { CompositeTilemap } from '@pixi/tilemap';
import type { Level } from './Level';
import { TileType, TILE_WIDTH, TILE_HEIGHT } from './TileType';
import { tilesetRect } from '../render/Sheets';
import { world } from '../world';

// Wall sprites are 32×48 (16px cap molding + 32px brick face) baked in AssetLoader.
// They stand one tile wide; the extra 16px rises above the tile for a top-down look.
const WALL_RISE = 16;

// ── Floor UV coords (mainlevbuild.png) ───────────────────────────────────────
// The floor grid has transparent spacer rows, so each 32×32 window must sit on a
// fully-opaque band. Gray cobblestone for the dungeon; teal flagstone for safe
// rooms so the two read differently.
const FLOOR_VARIANTS: [number, number][] = [
  [736, 272], [784, 272], [736, 320], [784, 320],
];
const SAFE_FLOOR_VARIANTS: [number, number][] = [
  [832, 208], [880, 208], [832, 272], [880, 272],
];

function floorTex(variant: number, safe: boolean) {
  const set = safe ? SAFE_FLOOR_VARIANTS : FLOOR_VARIANTS;
  const [px, py] = set[variant % set.length];
  return tilesetRect(px, py, TILE_WIDTH, TILE_HEIGHT);
}

export function buildLevelView(level: Level): Container {
  const container = new Container();
  container.sortableChildren = false;

  const holes = new Graphics();
  const floors = new CompositeTilemap();

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

      // Floor under everything (hidden beneath wall bodies, but cheap and seamless)
      const fTex = floorTex(tile.imageVariant % 4, level.isSafeZone(tx, ty));
      floors.tile(fTex, wx, wy, {
        u: fTex.frame.x,
        v: fTex.frame.y,
        tileWidth: TILE_WIDTH,
        tileHeight: TILE_HEIGHT,
      });
    }
  }

  // Walls are depth-sorted entities (see syncWalls), not drawn here.
  container.addChild(holes, floors);
  return container;
}

/** Spawn wall-tile entities so walls depth-sort against characters. */
export function syncWalls(level: Level): void {
  for (const e of world.with('wallTile')) {
    e.sprite?.destroy();
    world.remove(e);
  }

  for (let ty = 0; ty < level.height; ty++) {
    for (let tx = 0; tx < level.width; tx++) {
      const tile = level.getTile(tx, ty);
      if (tile?.type !== TileType.Wall && tile?.type !== TileType.BreakableWall) continue;

      const sheet = tile.type === TileType.BreakableWall ? 'wall_breakable' : 'wall_main';
      world.add({
        // Sort by the tile's southern edge; cap rises WALL_RISE above the tile.
        position: { x: tx * TILE_WIDTH + TILE_WIDTH / 2, y: ty * TILE_HEIGHT + TILE_HEIGHT },
        visual: { sheet, col: 0, row: 0 },
        wallTile: { tileX: tx, tileY: ty },
        // 32×48 sprite is centre-anchored; half its height puts the base on the tile's south edge.
        yOffset: (TILE_HEIGHT + WALL_RISE) / 2,
      });
    }
  }
}

export function resetWalls(): void {
  for (const e of world.with('wallTile')) {
    e.sprite?.destroy();
    world.remove(e);
  }
}
