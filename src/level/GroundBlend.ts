import type { Level } from './Level';
import { GROUND_KINDS, groundAt } from './TerrainAutotile';
import type { Ground } from './TerrainAutotile';
import { TILE_WIDTH, TILE_HEIGHT } from './TileType';
import { forEachTile } from './Grid';

/**
 * Soft edges between kinds of ground: where cave earth meets cobbles (or rough earth meets stone, or the
 * corridor meets the safe room's slabs), the softer ground spills a few pixels over the edge of the other,
 * instead of the two stopping at a straight tile line. Each blend is one overlay drawn on the tile it
 * spills onto, cut from the neighbour's own texture (render/BlendAtlas.ts fades it).
 */

/** The side of the tile the neighbour lies on: an edge, or (for an outer corner) a diagonal. */
export const BLEND_SIDES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const;
export type BlendSide = (typeof BLEND_SIDES)[number];

export type GroundBlend = { dx: number; dy: number; side: BlendSide; from: Ground };

/** Each edge with its neighbour's offset and a bit for it; a diagonal with the bits of the two edges beside it. */
const EDGES = [['n', 0, -1, 1], ['s', 0, 1, 2], ['e', 1, 0, 4], ['w', -1, 0, 8]] as const;
/** The corner blends only when neither edge beside it already does. */
const CORNERS = [['ne', 1, -1, 1 | 4], ['nw', -1, -1, 1 | 8], ['se', 1, 1, 2 | 4], ['sw', -1, 1, 2 | 8]] as const;

/** Softer ground spills over harder (a lower index in GROUND_KINDS is softer). */
function spillsOver(from: Ground | null, onto: Ground): from is Ground {
  return !!from && GROUND_KINDS.indexOf(from.kind) < GROUND_KINDS.indexOf(onto.kind);
}

/** The blends one floor tile gets from its neighbours: an edge per softer neighbour, and the open corners. */
function blendsOnto(level: Level, tx: number, ty: number, out: GroundBlend[]): void {
  const onto = groundAt(level, tx, ty);
  if (!onto) return;
  const dx = tx * TILE_WIDTH;
  const dy = ty * TILE_HEIGHT;
  let edged = 0;
  for (const [side, ox, oy, bit] of EDGES) {
    const from = groundAt(level, tx + ox, ty + oy);
    if (!spillsOver(from, onto)) continue;
    out.push({ dx, dy, side, from });
    edged |= bit;
  }
  for (const [side, ox, oy, beside] of CORNERS) {
    const from = groundAt(level, tx + ox, ty + oy);
    if ((edged & beside) !== 0 || !spillsOver(from, onto)) continue;
    out.push({ dx, dy, side, from });
  }
}

/** Every soft edge of a level, worked out once when its terrain is built. */
export function groundBlends(level: Level): GroundBlend[] {
  const out: GroundBlend[] = [];
  forEachTile(0, 0, level.width - 1, level.height - 1, (tx, ty) => blendsOnto(level, tx, ty, out));
  return out;
}
