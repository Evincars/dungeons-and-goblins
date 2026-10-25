import RBush from 'rbush';
import { q, world } from '../../world';
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
  /** Torches and campfires (they crackle). */
  torch: 64,
} as const;

type Item = { minX: number; minY: number; maxX: number; maxY: number; entity: Entity; kind: number };

/** Result of `nearby` when the caller passes no array of its own. */
const scratch: Entity[] = [];
const NOBODY: Entity = {};
/** The box searched for, reused by every query. */
const box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

function kindOf(e: Entity): number {
  if (e.playerInput) return Sense.player;
  if (e.ai || e.dummy) return Sense.mob;
  if (e.spawner) return Sense.nest;
  if (e.loot) return Sense.loot;
  if (e.item) return Sense.item;
  if (e.shopNpc || e.exitButton || e.chest || e.lever || e.stash) return Sense.usable;
  if (e.torch) return Sense.torch;
  return 0;
}

function inRange(item: Item, x: number, y: number, r2: number): boolean {
  const p = item.entity.position;
  return !!p && !item.entity.removed && (p.x - x) ** 2 + (p.y - y) ** 2 <= r2;
}

/** An R-tree over the entities of some kinds, rebuilt from where they stand the first time it is asked after going stale. */
class KindIndex {
  private readonly tree = new RBush<Item>();
  /** Index entries, reused from rebuild to rebuild. */
  private readonly pool: Item[] = [];
  private readonly loaded: Item[] = [];
  stale = true;

  constructor(private readonly kinds: number) {}

  private entry(i: number): Item {
    return this.pool[i] ?? (this.pool[i] = { minX: 0, minY: 0, maxX: 0, maxY: 0, entity: NOBODY, kind: 0 });
  }

  private build(): void {
    this.stale = false;
    this.tree.clear();
    const loaded = this.loaded;
    loaded.length = 0;
    for (const e of q.positioned) {
      const kind = e.removed ? 0 : kindOf(e) & this.kinds;
      if (kind === 0) continue;
      const item = this.entry(loaded.length);
      item.minX = item.maxX = e.position.x;
      item.minY = item.maxY = e.position.y;
      item.entity = e;
      item.kind = kind;
      loaded.push(item);
    }
    // Spare entries must not keep removed entities alive.
    for (let i = loaded.length; i < this.pool.length; i++) this.pool[i].entity = NOBODY;
    this.tree.load(loaded);
  }

  /** Adds to `out` its entities of `kinds` within `radius` of (x, y). */
  collect(x: number, y: number, radius: number, kinds: number, out: Entity[]): void {
    if ((kinds & this.kinds) === 0) return;
    if (this.stale) this.build();
    const r2 = radius * radius;
    box.minX = x - radius;
    box.minY = y - radius;
    box.maxX = x + radius;
    box.maxY = y + radius;
    for (const item of this.tree.search(box)) {
      if ((item.kind & kinds) !== 0 && inRange(item, x, y, r2)) out.push(item.entity);
    }
  }
}

/**
 * What never moves once it is placed — items on the floor, things to use, nests, torches — has an index of its
 * own, rebuilt only when one of them comes or goes (a floor strewn with dropped gear costs nothing per tick).
 * Everything that moves is indexed afresh every tick.
 */
const STILL_KINDS = Sense.nest | Sense.item | Sense.usable | Sense.torch;
const moving = new KindIndex(Sense.player | Sense.mob | Sense.loot);
const still = new KindIndex(STILL_KINDS);

/** The components that make something still (whatever order a co-op guest's copy gains them in). */
const STILL_PARTS = ['spawner', 'item', 'shopNpc', 'exitButton', 'chest', 'lever', 'stash', 'torch'] as const;
/** A still thing placed, taken away or used up: its index is rebuilt at the next question. */
const stir = () => {
  still.stale = true;
};
for (const part of STILL_PARTS) {
  const query = world.with('position', part);
  query.onEntityAdded.subscribe(stir);
  query.onEntityRemoved.subscribe(stir);
}
q.removed.onEntityAdded.subscribe((e) => {
  if (kindOf(e) & STILL_KINDS) stir();
});

/**
 * Marks the index of moving things out of date: the next query rebuilds it from where they are now. Called at
 * the start of each tick and again once everything has moved, so every check in a phase reads one snapshot.
 */
export function beginPerception(): void {
  moving.stale = true;
}

/**
 * Entities of the given kinds within `radius` pixels of a point, from the spatial index (R-trees), written
 * into `out` (cleared first). Without `out` a shared scratch array is used: read it at once, and never while
 * iterating another result that used it.
 */
export function nearby(x: number, y: number, radius: number, kinds: number, out: Entity[] = scratch): Entity[] {
  out.length = 0;
  moving.collect(x, y, radius, kinds, out);
  still.collect(x, y, radius, kinds, out);
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
