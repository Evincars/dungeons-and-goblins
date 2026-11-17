import type { Level } from './Level';
import { GROUND_KINDS, groundAt } from './TerrainAutotile';
import type { Ground } from './TerrainAutotile';
import { TILE_WIDTH, TILE_HEIGHT } from './TileType';
import { forEachTile, tileHash } from './Grid';

/**
 * Soft edges between kinds of ground: where cave earth meets cobbles, rough earth or moss meets stone, or the corridor
 * meets the safe room's slabs, the softer ground runs well over the edge of the other along a ragged line — reaching
 * most of the way across the tile here, only a little there, with specks of it strewn past its edge — instead of the
 * two stopping at a straight tile line. Each blend is one overlay drawn on the tile it spills onto, cut from the
 * neighbour's own texture (render/BlendAtlas.ts bakes the cut, by blendCovers).
 *
 * The line wanders by noise laid along the edge in world position (repeating every BLEND_PERIOD tiles), so it runs on
 * unbroken from one tile's edge to the next: a blend's `variant` is where along that period its tile lies.
 */

/** The side of the tile the neighbour lies on: an edge, or (for an outer corner) a diagonal. */
export const BLEND_SIDES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const;
export type BlendSide = (typeof BLEND_SIDES)[number];

export type GroundBlend = { dx: number; dy: number; side: BlendSide; from: Ground; variant: number };

/** The wandering line repeats every this many tiles along an edge (so only this many cuts of each side are baked). */
export const BLEND_PERIOD = 4;
const PERIOD_PX = BLEND_PERIOD * TILE_WIDTH;
/**
 * How far (px) the spilled ground reaches into the tile on average, how far its line wanders either way of that (slowly,
 * along the edge), and how much finer noise roughens it into a ragged line with specks past it.
 */
const BASE_REACH = 17;
const WANDER = 10;
const RAGGED = 5;
/** The wandering line's lattice spacing along the edge (px), and the ragged noise's (px, both ways). */
const WANDER_SPACING = 32;
const RAGGED_SPACING = 4;
/** Salts keeping the two noises (and the corners') apart. */
const RAGGED_SALT = 7919;
const CORNER_SALT = 104729;

/** Each edge with its neighbour's offset and a bit for it; a diagonal with the bits of the two edges beside it. */
const EDGES = [['n', 0, -1, 1], ['s', 0, 1, 2], ['e', 1, 0, 4], ['w', -1, 0, 8]] as const;
/** The corner blends only when neither edge beside it already does. */
const CORNERS = [['ne', 1, -1, 1 | 4], ['nw', -1, -1, 1 | 8], ['se', 1, 1, 2 | 4], ['sw', -1, 1, 2 | 8]] as const;

/** n mod m, never negative. */
function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** A lattice value, 0..1, its column repeating along the period. */
function lattice(i: number, j: number, spacing: number, salt: number): number {
  return (tileHash(mod(i, PERIOD_PX / spacing) + salt, j) % 1024) / 1023;
}

/** Smooth value noise, 0..1, at (u along the edge, v into the tile), repeating every PERIOD_PX along the edge. */
function noise(u: number, v: number, spacing: number, salt: number): number {
  const gu = u / spacing;
  const gv = v / spacing;
  const i = Math.floor(gu);
  const j = Math.floor(gv);
  const a = smooth(gu - i);
  const b = smooth(gv - j);
  const top = lattice(i, j, spacing, salt) * (1 - a) + lattice(i + 1, j, spacing, salt) * a;
  const bottom = lattice(i, j + 1, spacing, salt) * (1 - a) + lattice(i + 1, j + 1, spacing, salt) * a;
  return top * (1 - b) + bottom * b;
}

/**
 * How far into the tile pixel (x, y) lies from the side the ground spills from, and where along that side it is (a
 * corner: its distance from the corner, and the angle round it, stretched to a tile).
 */
function frame(side: BlendSide, x: number, y: number): { depth: number; along: number } {
  const fromN = y + 0.5;
  const fromS = TILE_HEIGHT - 0.5 - y;
  const fromW = x + 0.5;
  const fromE = TILE_WIDTH - 0.5 - x;
  switch (side) {
    case 'n': return { depth: fromN, along: x };
    case 's': return { depth: fromS, along: x };
    case 'w': return { depth: fromW, along: y };
    case 'e': return { depth: fromE, along: y };
    case 'ne': return corner(fromN, fromE);
    case 'nw': return corner(fromN, fromW);
    case 'se': return corner(fromS, fromE);
    default: return corner(fromS, fromW);
  }
}

function corner(a: number, b: number): { depth: number; along: number } {
  return { depth: Math.hypot(a, b), along: (Math.atan2(a, b) / (Math.PI / 2)) * TILE_WIDTH + CORNER_SALT };
}

/**
 * Whether pixel (x, y) of a tile is covered by ground spilling from `side`, the tile lying `variant` tiles along the
 * period: nearer the side than the wandering, ragged line there.
 */
export function blendCovers(side: BlendSide, variant: number, x: number, y: number): boolean {
  const { depth, along } = frame(side, x, y);
  const u = mod(variant, BLEND_PERIOD) * TILE_WIDTH + along;
  const reach = BASE_REACH + WANDER * (noise(u, 0, WANDER_SPACING, 0) * 2 - 1);
  const ragged = RAGGED * (noise(u, depth, RAGGED_SPACING, RAGGED_SALT) * 2 - 1);
  // The diagonals (only where neither edge beside them blends) are a smaller round bite.
  const scale = side.length === 2 ? 0.75 : 1;
  return depth < (reach + ragged) * scale;
}

/** Where along the period a tile's edge on `side` lies: by column along a north or south edge, by row along a side one. */
function variantOf(side: BlendSide, tx: number, ty: number): number {
  if (side === 'n' || side === 's') return mod(tx, BLEND_PERIOD);
  if (side === 'e' || side === 'w') return mod(ty, BLEND_PERIOD);
  return mod(tx + ty, BLEND_PERIOD);
}

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
    out.push({ dx, dy, side, from, variant: variantOf(side, tx, ty) });
    edged |= bit;
  }
  for (const [side, ox, oy, beside] of CORNERS) {
    const from = groundAt(level, tx + ox, ty + oy);
    if ((edged & beside) !== 0 || !spillsOver(from, onto)) continue;
    out.push({ dx, dy, side, from, variant: variantOf(side, tx, ty) });
  }
}

/** Every soft edge of a level, worked out once when its terrain is built. */
export function groundBlends(level: Level): GroundBlend[] {
  const out: GroundBlend[] = [];
  forEachTile(0, 0, level.width - 1, level.height - 1, (tx, ty) => blendsOnto(level, tx, ty, out));
  return out;
}
