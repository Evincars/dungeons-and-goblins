import { Container, Graphics } from 'pixi.js';
import type { Level } from './Level';
import { buildTerrainPieces, CAVE_GROUND, OVERHEAD_Z } from './TerrainAutotile';
import type { TerrainPiece } from './TerrainAutotile';
import { tilesetRect } from '../render/Sheets';
import { StaticTileLayer } from '../render/StaticTileLayer';
import { groundBlends } from './GroundBlend';
import { blendTexture, commitBlendAtlas } from '../render/BlendAtlas';
import { mineGroundOverlays } from './MineGround';
import { commitMineGroundAtlas, mineOverlayTexture } from '../render/MineGroundAtlas';
import { THEME_VOID, tilesetKey } from './Theme';
import { SeeThroughWalls } from '../render/SeeThrough';
import { TILE_HEIGHT, TILE_WIDTH } from './TileType';

export type LevelView = {
  /** Floors, faces and wall tops that lie beneath every entity. */
  base: Container;
  /**
   * Wall rows characters can stand behind, and arch lintels: each layer carries
   * a zIndex so it depth-sorts with entities in the game layer.
   */
  occluders: Container[];
  /** Those wall batches, filed by where their pieces lie, to be cleared over whoever stands behind them. */
  seeThrough: SeeThroughWalls;
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

/** How far past the map's edges its dark runs (more than a screen, so the camera never sees past it). */
const VOID_MARGIN = 2048;

/** The dark under everything, the colour of the theme's void, reaching well past the map's edges. */
function voidBackdrop(level: Level): Graphics {
  const w = level.width * TILE_WIDTH;
  const h = level.height * TILE_HEIGHT;
  return new Graphics().rect(-VOID_MARGIN, -VOID_MARGIN, w + 2 * VOID_MARGIN, h + 2 * VOID_MARGIN).fill(THEME_VOID[level.theme]);
}

/** A piece of a wall someone can stand behind, cleared over them (render/SeeThrough.ts): not an arch overhead. */
function seesThrough(p: TerrainPiece): p is TerrainPiece & { z: number } {
  return p.z !== undefined && p.z < OVERHEAD_Z;
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
  const seeThrough = new SeeThroughWalls(level.width * TILE_WIDTH);
  for (const p of buildTerrainPieces(level)) {
    const layer = pieceLayer(p, flat, byZ);
    layer.addTile(tilesetRect(p.sx, p.sy, p.w, p.h, p.sheet ?? tileset), p.dx, p.dy);
    if (seesThrough(p)) seeThrough.addPiece(layer, p.z, p.dx, p.dy, p.w, p.h);
  }
  for (const blend of groundBlends(level)) blends.addTile(blendTexture(blend), blend.dx, blend.dy);
  for (const cut of mineGroundOverlays(level)) blends.addTile(mineOverlayTexture(cut), cut.dx, cut.dy);
  commitBlendAtlas();
  commitMineGroundAtlas();
  const container = new Container();
  container.addChild(voidBackdrop(level), cave, floors, blends, base);
  return { base: container, occluders: [...byZ.values()], seeThrough };
}
