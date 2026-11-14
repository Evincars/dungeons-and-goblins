import { Container } from 'pixi.js';
import type { Level } from './Level';
import { buildTerrainPieces } from './TerrainAutotile';
import type { TerrainPiece } from './TerrainAutotile';
import { tilesetRect } from '../render/Sheets';
import { StaticTileLayer } from '../render/StaticTileLayer';
import { groundBlends } from './GroundBlend';
import { blendTexture, commitBlendAtlas } from '../render/BlendAtlas';
import { tilesetKey } from './Theme';
import { CAVE_GROUND } from './TerrainAutotile';

export type LevelView = {
  /** Floors, faces and wall tops that lie beneath every entity. */
  base: Container;
  /**
   * Wall rows characters can stand behind, and arch lintels: each layer carries
   * a zIndex so it depth-sorts with entities in the game layer.
   */
  occluders: Container[];
};

/** The flat batches pieces go to, bottom up. */
type FlatLayers = { cave: StaticTileLayer; floors: StaticTileLayer; base: StaticTileLayer };

/** A piece's batch: cave ground at the very bottom, then floors, then the walls and overlays (or their depth's layer). */
function pieceLayer(p: TerrainPiece, flat: FlatLayers, byZ: Map<number, StaticTileLayer>): StaticTileLayer {
  if (p.sheet === CAVE_GROUND) return flat.cave;
  if (p.floor) return flat.floors;
  return layerFor(p, flat.base, byZ);
}

/** The batch a piece belongs to: the flat base, or the occluder layer for its depth (made on first use). */
function layerFor(piece: TerrainPiece, base: StaticTileLayer, byZ: Map<number, StaticTileLayer>): StaticTileLayer {
  if (piece.z === undefined) return base;
  let layer = byZ.get(piece.z);
  if (!layer) {
    layer = new StaticTileLayer();
    layer.zIndex = piece.z;
    byZ.set(piece.z, layer);
  }
  return layer;
}

/**
 * Batches the autotiled terrain into Pixi v8 ParticleContainers (see StaticTileLayer): the terrain never
 * moves, so it is uploaded once and drawn as a handful of batches instead of thousands of sprites. Bottom
 * up: cave ground and catacomb floors, the soft edges where kinds of ground meet, then walls and overlays.
 */
export function buildLevelView(level: Level): LevelView {
  // A batch draws from one image, so cave ground, the other floors, the edge fades and the walls each have one.
  const cave = new StaticTileLayer();
  const floors = new StaticTileLayer();
  const blends = new StaticTileLayer();
  const base = new StaticTileLayer();
  const byZ = new Map<number, StaticTileLayer>();
  // Walls and overlays come from the level's own tileset: the catacombs' or the castle's.
  const tileset = tilesetKey(level.theme);
  const flat = { cave, floors, base };
  // Walls, overlays and the isometric castle's chasm rims may come from another sheet than the level's own.
  for (const p of buildTerrainPieces(level)) pieceLayer(p, flat, byZ).addTile(tilesetRect(p.sx, p.sy, p.w, p.h, p.sheet ?? tileset), p.dx, p.dy);
  for (const blend of groundBlends(level)) blends.addTile(blendTexture(blend), blend.dx, blend.dy);
  commitBlendAtlas();
  const container = new Container();
  container.addChild(cave, floors, blends, base);
  return { base: container, occluders: [...byZ.values()] };
}
