import RBush from 'rbush';
import { q } from '../../world';
import type { Entity } from '../../world';

/**
 * What an entity is to the senses and proximity checks: the groups they ask about, as bit flags so a
 * query names several at once without allocating (`Sense.mob | Sense.player`).
 */
export const Sense = {
  player: 1,
  mob: 2,
  nest: 4,
  loot: 8,
  item: 16,
  /** Things a player can use: the shop keeper, unopened chests, the exit button. */
  usable: 32,
} as const;

type Item = { minX: number; minY: number; maxX: number; maxY: number; entity: Entity; kind: number };

const tree = new RBush<Item>();
/** Index entries, reused from rebuild to rebuild. */
const pool: Item[] = [];
const loaded: Item[] = [];
let stale = true;
/** Result of `nearby` when the caller passes no array of its own. */
const scratch: Entity[] = [];
const NOBODY: Entity = {};

function kindOf(e: Entity): number {
  if (e.playerInput) return Sense.player;
  if (e.ai || e.dummy) return Sense.mob;
  if (e.spawner) return Sense.nest;
  if (e.loot) return Sense.loot;
  if (e.item) return Sense.item;
  if (e.shopNpc || e.exitButton || e.chest || e.lever || e.stash) return Sense.usable;
  return 0;
}

/**
 * Marks the index out of date: the next query rebuilds it from where things are now. Called at the start
 * of each tick and again once everything has moved, so every check in a phase reads one snapshot.
 */
export function beginPerception(): void {
  stale = true;
}

function itemAt(i: number): Item {
  return pool[i] ?? (pool[i] = { minX: 0, minY: 0, maxX: 0, maxY: 0, entity: NOBODY, kind: 0 });
}

function ensureBuilt(): void {
  if (!stale) return;
  stale = false;
  tree.clear();
  loaded.length = 0;
  for (const e of q.positioned) {
    const kind = e.removed ? 0 : kindOf(e);
    if (kind === 0) continue;
    const item = itemAt(loaded.length);
    item.minX = item.maxX = e.position.x;
    item.minY = item.maxY = e.position.y;
    item.entity = e;
    item.kind = kind;
    loaded.push(item);
  }
  // Spare entries must not keep removed entities alive.
  for (let i = loaded.length; i < pool.length; i++) pool[i].entity = NOBODY;
  tree.load(loaded);
}

function inRange(item: Item, x: number, y: number, r2: number): boolean {
  const p = item.entity.position;
  return !!p && !item.entity.removed && (p.x - x) ** 2 + (p.y - y) ** 2 <= r2;
}

/**
 * Entities of the given kinds within `radius` pixels of a point, from the spatial index (an R-tree),
 * written into `out` (cleared first). Without `out` a shared scratch array is used: read it at once,
 * and never while iterating another result that used it.
 */
export function nearby(x: number, y: number, radius: number, kinds: number, out: Entity[] = scratch): Entity[] {
  ensureBuilt();
  out.length = 0;
  const r2 = radius * radius;
  for (const item of tree.search({ minX: x - radius, minY: y - radius, maxX: x + radius, maxY: y + radius })) {
    if ((item.kind & kinds) === 0 || !inRange(item, x, y, r2)) continue;
    out.push(item.entity);
  }
  return out;
}

/** The nearest entity of the given kinds within `radius` that `accept` (if given) agrees to, or null. */
export function nearest(x: number, y: number, radius: number, kinds: number, accept?: (e: Entity) => boolean): Entity | null {
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const e of nearby(x, y, radius, kinds)) {
    if (!e.position || (accept && !accept(e))) continue;
    const d = (e.position.x - x) ** 2 + (e.position.y - y) ** 2;
    if (d >= bestD) continue;
    bestD = d;
    best = e;
  }
  return best;
}
