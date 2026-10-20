import { MathUtils } from 'yuka';
import { world, q, isMob } from '../world';
import type { Entity, MobType } from '../world';
import type { Level } from '../level/Level';
import { createMob, mobRadius } from '../entities/MobFactory';
import { TileType, TILE_WIDTH, TILE_HEIGHT } from '../level/TileType';
import { nearby, Sense } from '../ai/perception/spatial';

const DENSITY_RADIUS = 5 * TILE_WIDTH;
export const MAX_PER_NEST = 5;
const SPAWN_JITTER = 5;
const MAX_TOTAL_MOBS = 30;
const MOB_DENSITY = 8;
/** A new mob keeps this much space from one of its own kind. */
const SAME_KIND_GAP = 8;

const crowd: Entity[] = [];

function liveMobCount(): number {
  let n = 0;
  for (const mob of q.mobs) if (!mob.removed && mob.health.current > 0) n++;
  return n;
}

/** Whether a mob of `type` placed at (x, y) would overlap another of its kind. */
function overlapsKin(type: MobType, x: number, y: number, mob: Entity): boolean {
  if (!isMob(mob) || mob.mobType !== type) return false;
  const r = mobRadius(type);
  return Math.abs(mob.position.x - x) < r.x + SAME_KIND_GAP + mob.radius.x
    && Math.abs(mob.position.y - y) < r.y + SAME_KIND_GAP + mob.radius.y;
}

/** Open floor, room under the global cap, no kin in the way, and the area not already crowded. */
export function canSpawnMob(level: Level, type: MobType, x: number, y: number): boolean {
  const tile = level.getTileAt(x, y);
  if (!tile || !tile.passable || tile.type === TileType.Hole) return false;
  if (liveMobCount() >= MAX_TOTAL_MOBS) return false;
  let inRegion = 0;
  for (const mob of nearby(x, y, DENSITY_RADIUS, Sense.mob, crowd)) {
    if (!isMob(mob) || mob.health.current <= 0) continue;
    if (overlapsKin(type, x, y, mob)) return false;
    inRegion++;
  }
  return inRegion < MOB_DENSITY;
}

const broods = world.with('ai', 'spawnedBy');

function broodSize(nestId: number | undefined): number {
  let brood = 0;
  for (const mob of broods) {
    if (mob.spawnedBy === nestId && !mob.removed && (mob.health?.current ?? 1) > 0) brood++;
  }
  return brood;
}

function spawnFrom(level: Level, nest: (typeof q.spawners)['entities'][number]): void {
  const s = nest.spawner;
  const x = MathUtils.clamp(nest.position.x + (Math.random() - 0.5) * SPAWN_JITTER, 0, level.width * TILE_WIDTH);
  const y = MathUtils.clamp(nest.position.y + (Math.random() - 0.5) * SPAWN_JITTER, 0, level.height * TILE_HEIGHT);
  const nestId = world.id(nest);
  if (broodSize(nestId) >= MAX_PER_NEST || !canSpawnMob(level, s.mobType, x, y)) return;
  const mob = createMob(level, s.mobType, x, y);
  if (nestId !== undefined) world.addComponent(mob, 'spawnedBy', nestId);
  s.spawnCount++;
}

export function updateSpawners(level: Level): void {
  for (const nest of q.spawners) {
    if (nest.removed || (nest.health?.current ?? 1) <= 0) continue;
    const s = nest.spawner;
    if (s.spawnCount >= s.maxSpawns || (nest.freezeTime ?? 0) > 0) continue;
    if (--s.timer > 0) continue;
    s.timer = s.interval;
    spawnFrom(level, nest);
  }
}
