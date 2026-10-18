import { world } from '../world';
import type { Entity } from '../world';
import type { Level } from '../level/Level';
import { createMob, mobRadius } from '../entities/MobFactory';
import { TileType, TILE_WIDTH, TILE_HEIGHT } from '../level/TileType';

const DENSITY_RADIUS = 5 * TILE_WIDTH;
export const MAX_PER_NEST = 5;
const SPAWN_JITTER = 5;
const MAX_TOTAL_MOBS = 30;
const MOB_DENSITY = 8;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function canSpawnMob(level: Level, type: string, x: number, y: number): boolean {
  const tile = level.getTileAt(x, y);
  if (!tile || !tile.passable || tile.type === TileType.Hole) return false;

  const r = mobRadius(type);
  const mobs = [...world.with('position', 'radius', 'ai')].filter((m) => !m.removed && (m.health?.current ?? 1) > 0);
  if (mobs.length >= MAX_TOTAL_MOBS) return false;

  let inRegion = 0;
  for (const mob of mobs) {
    const mp = mob.position!;
    if (mob.mobType === type
      && Math.abs(mp.x - x) < r.x + 8 + mob.radius!.x
      && Math.abs(mp.y - y) < r.y + 8 + mob.radius!.y) return false;
    if (Math.hypot(mp.x - x, mp.y - y) < DENSITY_RADIUS) inRegion++;
  }
  return inRegion < MOB_DENSITY;
}

function spawnFrom(level: Level, nest: Entity): void {
  const s = nest.spawner!;
  const pos = nest.position!;
  const x = clamp(pos.x + (Math.random() - 0.5) * SPAWN_JITTER, 0, level.width * TILE_WIDTH);
  const y = clamp(pos.y + (Math.random() - 0.5) * SPAWN_JITTER, 0, level.height * TILE_HEIGHT);

  const nestId = world.id(nest);
  let brood = 0;
  for (const mob of world.with('ai', 'spawnedBy')) {
    if (mob.spawnedBy === nestId && !mob.removed && (mob.health?.current ?? 1) > 0) brood++;
  }
  if (brood >= MAX_PER_NEST) return;
  if (!canSpawnMob(level, s.mobType, x, y)) return;

  const mob = createMob(level, s.mobType, x, y);
  if (nestId !== undefined) world.addComponent(mob, 'spawnedBy', nestId);
  s.spawnCount++;
}

export function updateSpawners(level: Level, _dt: number): void {
  for (const nest of world.with('position', 'spawner')) {
    if (nest.removed || (nest.health?.current ?? 1) <= 0) continue;
    const s = nest.spawner!;
    if (s.spawnCount >= s.maxSpawns) continue;
    if ((nest.freezeTime ?? 0) > 0) continue;
    if (--s.timer > 0) continue;
    s.timer = s.interval;
    spawnFrom(level, nest);
  }
}
