import { Container } from 'pixi.js';
import { CompositeTilemap } from '@pixi/tilemap';
import type { Level } from './Level';
import { buildTerrainPieces } from './TerrainAutotile';
import { tilesetRect } from '../render/Sheets';

/**
 * Static terrain (floors, wall outlines, brick faces, pits) batched into one
 * tilemap. Walls never overlap the floor in front of them, so the whole layer
 * sits beneath every entity and needs no depth sorting.
 */
export function buildLevelView(level: Level): Container {
  const container = new Container();
  const map = new CompositeTilemap();
  for (const p of buildTerrainPieces(level)) {
    map.tile(tilesetRect(p.sx, p.sy, p.w, p.h), p.dx, p.dy);
  }
  container.addChild(map);
  return container;
}
