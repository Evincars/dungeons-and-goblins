import type { Level } from '../../level/Level';
import { TileType, TILE_WIDTH, TILE_HEIGHT } from '../../level/TileType';
import { tileGraphOf } from '../../level/TileGraph';
import type { StepCost } from '../../level/TileGraph';
import { findRoute } from '../../level/TileSearch';
import { someTile } from '../../level/Grid';
import { FLANK_AVOID_COST, PIT_EDGE_COST } from '../constants';

/**
 * Where enemies can walk and what each step costs them. Walls, obstacles, pits and the safe rooms are
 * off limits (enemies cannot fight in a safe room, so they never path into one); a tile beside a pit
 * costs more, because a shove there would tip them in. Costs are cached per level and rebuilt only
 * when its tiles change.
 */

type CostCache = { revision: number; cost: Float32Array };
const caches = new WeakMap<Level, CostCache>();

/** 4-neighbour offsets as [dx, dy]. */
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;

function isPit(level: Level, tx: number, ty: number): boolean {
  return level.getTile(tx, ty)?.type === TileType.Hole;
}

function bordersPit(level: Level, tx: number, ty: number): boolean {
  return DIRS.some(([dx, dy]) => isPit(level, tx + dx, ty + dy));
}

function stepCostOf(level: Level, tx: number, ty: number): number {
  const tile = level.getTile(tx, ty);
  if (!tile || !tile.passable || tile.type === TileType.Hole || level.isSafeZone(tx, ty)) return Infinity;
  return bordersPit(level, tx, ty) ? 1 + PIT_EDGE_COST : 1;
}

/** What stepping onto each tile costs an enemy (`Infinity` = never), indexed `tx + ty * width`. */
export function mobStepCosts(level: Level): Float32Array {
  const cached = caches.get(level);
  if (cached && cached.revision === level.revision) return cached.cost;
  const cost = new Float32Array(level.width * level.height);
  for (let t = 0; t < cost.length; t++) cost[t] = stepCostOf(level, t % level.width, Math.floor(t / level.width));
  caches.set(level, { revision: level.revision, cost });
  return cost;
}

/** Whether an enemy can stand on the tile with the given index. */
export function standable(level: Level, tile: number): boolean {
  return tile >= 0 && tile < level.width * level.height && mobStepCosts(level)[tile] < Infinity;
}

// One StepCost function serves every search; these say what it prices for the search under way.
let activeCost: Float32Array = new Float32Array(0);
let activeAvoid: Uint8Array | null = null;
const mobStep: StepCost = (_from, to) => {
  const base = activeCost[to];
  return activeAvoid !== null && activeAvoid[to] === 1 ? base + FLANK_AVOID_COST : base;
};

/**
 * An enemy's cheapest route between two tiles by Yuka's A*, as the tiles to walk after `from`; empty
 * when there is none. Tiles marked in `avoid` cost extra, so the route goes round them when it can.
 */
export function mobRoute(level: Level, from: number, to: number, avoid: Uint8Array | null = null): number[] {
  activeCost = mobStepCosts(level);
  if (!standable(level, to)) return [];
  activeAvoid = avoid;
  const route = findRoute(tileGraphOf(level), from, to, mobStep);
  activeAvoid = null;
  return route;
}

/** The tile an enemy can stand on nearest to a point, searching `radius` tiles around it; -1 if none. */
export function nearestStandable(level: Level, x: number, y: number, radius: number): number {
  const cx = Math.floor(x / TILE_WIDTH);
  const cy = Math.floor(y / TILE_HEIGHT);
  let best = -1;
  let bestD = Infinity;
  someTile(cx - radius, cy - radius, cx + radius, cy + radius, (tx, ty) => {
    const inside = tx >= 0 && ty >= 0 && tx < level.width && ty < level.height;
    const t = tx + ty * level.width;
    const d = (tx - cx) ** 2 + (ty - cy) ** 2;
    if (!inside || d >= bestD || !standable(level, t)) return false;
    bestD = d;
    best = t;
    return d === 0;
  });
  return best;
}

/** Half-width, in pixels, of the body that has to fit along a straight line. */
const BODY = 8;
/** Spacing of the samples taken along a line. */
const SAMPLE_STEP = 6;
const BODY_CORNERS = [[-BODY, -BODY], [BODY, -BODY], [-BODY, BODY], [BODY, BODY]] as const;

/** Whether a body centred at (x, y) touches nothing but plain, cheap ground. */
function bodyFits(level: Level, cost: Float32Array, x: number, y: number): boolean {
  for (const [ox, oy] of BODY_CORNERS) {
    const tx = Math.floor((x + ox) / TILE_WIDTH);
    const ty = Math.floor((y + oy) / TILE_HEIGHT);
    const inside = tx >= 0 && ty >= 0 && tx < level.width && ty < level.height;
    if (!inside || cost[tx + ty * level.width] > 1) return false;
  }
  return true;
}

/** Whether an enemy can walk the straight line between two points without touching a wall, pit edge or obstacle. */
export function clearLine(level: Level, ax: number, ay: number, bx: number, by: number): boolean {
  const cost = mobStepCosts(level);
  const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / SAMPLE_STEP));
  for (let i = 1; i <= steps; i++) {
    if (!bodyFits(level, cost, ax + ((bx - ax) * i) / steps, ay + ((by - ay) * i) / steps)) return false;
  }
  return true;
}
