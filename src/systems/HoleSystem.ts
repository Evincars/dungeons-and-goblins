import { world } from '../world';
import type { Entity } from '../world';
import type { Level } from '../level/Level';
import { TileType } from '../level/TileType';
import { createCoin } from '../entities/LootFactory';
import { sound } from '../audio/SoundPlayer';

/** Ticks from stepping off the edge to landing at the spawn; matches the falling cry's length. */
export const FALL_TICKS = 60;
/** How far the sprite sinks into the pit over the fall. */
export const FALL_DEPTH = 48;
/** Max health lost per fall. */
const FALL_PENALTY = 5;

/** Feet can overhang an edge while any part of their small support box has floor under it. */
export function overHole(level: Level, entity: Entity): boolean {
  const p = entity.position!;
  const rx = Math.min(6, entity.radius?.x ?? 0);
  const ry = Math.min(6, entity.radius?.y ?? 0);
  return [-rx, rx].every((dx) => [-ry, ry].every((dy) =>
    level.getTileAt(p.x + dx, p.y + dy)?.type === TileType.Hole));
}

/** Anything that walks onto a hole falls in: mobs are lost, players drop and respawn. */
export function updateHoles(level: Level): void {
  for (const entity of world.with('position', 'health')) {
    if (entity.removed || entity.respawnTicks !== undefined) continue;
    if (!overHole(level, entity)) continue;
    if (entity.playerInput) {
      if (!entity.falling) startFall(entity);
    } else {
      sound.playSound('fall', entity.position!.x, entity.position!.y);
      world.addComponent(entity, 'removed', true);
    }
  }
}

function startFall(player: Entity): void {
  const pos = player.position!;
  world.addComponent(player, 'falling', { age: 0, duration: FALL_TICKS });
  sound.playSound('falling', pos.x, pos.y);
}

/** Holds a falling player still while they drop, then lands them at spawn. */
export function updateFalling(level: Level): void {
  for (const player of world.with('position', 'falling')) {
    const fall = player.falling!;
    fall.age++;
    player.freezeTime = Math.max(player.freezeTime ?? 0, 2);
    if (player.velocity) player.velocity.x = player.velocity.y = 0;
    if (player.bump) player.bump.x = player.bump.y = 0;
    if (fall.age < fall.duration) continue;
    world.removeComponent(player, 'falling');
    respawnPlayer(player, level, 'fall');
  }
}

export function respawnPlayer(player: Entity, level: Level, reason: 'fall' | 'death' = 'fall'): void {
  const pos = player.position!;
  const health = player.health!;

  if (reason === 'fall') {
    sound.playSound('fall', pos.x, pos.y);
    // Half the purse scatters where they fell, as in Catacomb Snatch.
    const stats = player.playerStats;
    if (stats && stats.gold > 0) {
      let remaining = Math.floor(stats.gold / 2);
      stats.gold -= remaining;
      for (let i = 0; remaining > 0 && i < 8; i++) {
        const value = Math.max(1, Math.floor(remaining / 2));
        const dir = Math.random() * Math.PI * 2;
        createCoin(pos.x, pos.y, Math.cos(dir), Math.sin(dir), value);
        remaining -= value;
      }
    }
    health.max = Math.max(10, health.max - FALL_PENALTY);
  }

  const spawn = level.getRandomSpawnPoint();
  if (spawn) { pos.x = spawn.x; pos.y = spawn.y; }
  health.current = health.max;

  if (player.velocity) player.velocity.x = player.velocity.y = 0;
  if (player.bump) player.bump.x = player.bump.y = 0;
  player.hurtTime = reason === 'death' ? 60 : 0;
  player.freezeTime = 0;
  if (player.falling) world.removeComponent(player, 'falling');
}
