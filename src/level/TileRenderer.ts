import { Container } from 'pixi.js';
import { CompositeTilemap } from '@pixi/tilemap';
import type { Level } from './Level';
import { buildTerrainPieces } from './TerrainAutotile';
import { tilesetRect } from '../render/Sheets';

export type LevelView = {
  /** Floors, faces and wall tops that lie beneath every entity. */
  base: Container;
  /**
   * Wall rows characters can stand behind, and arch lintels: each layer carries
   * a zIndex so it depth-sorts with entities in the game layer.
   */
  occluders: Container[];
};

export function buildLevelView(level: Level): LevelView {
  const base = new CompositeTilemap();
  const byZ = new Map<number, CompositeTilemap>();
  for (const p of buildTerrainPieces(level)) {
    let map = base;
    if (p.z !== undefined) {
      map = byZ.get(p.z) ?? new CompositeTilemap();
      if (!byZ.has(p.z)) { map.zIndex = p.z; byZ.set(p.z, map); }
    }
    map.tile(tilesetRect(p.sx, p.sy, p.w, p.h), p.dx, p.dy);
  }
  const container = new Container();
  container.addChild(base);
  return { base: container, occluders: [...byZ.values()] };
}
