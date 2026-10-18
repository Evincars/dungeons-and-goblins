import { world } from '../world';
import type { Entity } from '../world';
import type { Level } from '../level/Level';
import { TileType } from '../level/TileType';
import { sound } from '../audio/SoundPlayer';

export const FALL_TICKS = 60;

export function overHole(level: Level, entity: Entity): boolean {
  const p = entity.position!;
  const rx = Math.min(6, entity.radius?.x ?? 0);
  const ry = Math.min(6, entity.radius?.y ?? 0);
  return [-rx, rx].every((dx) => [-ry, ry].every((dy) =>
    level.getTileAt(p.x + dx, p.y + dy)?.type === TileType.Hole));
}

export function updateHoles(level: Level): void {
  for (const entity of world.with('position', 'health')) {
    if (entity.removed || entity.respawnTicks !== undefined) continue;
    if (!overHole(level, entity)) continue;
    if (entity.playerInput) {
      if (!entity.falling) startFall(entity);
    } else {
      world.addComponent(entity, 'removed', true);
    }
  }
}

function startFall(player: Entity): void {
  world.addComponent(player, 'falling', { age: 0, duration: FALL_TICKS });
  sound.playSound('death');
}

export function respawnPlayer(player: Entity, level: Level, reason: 'fall' | 'death' = 'fall'): void {
  const pos = player.position!;
  const health = player.health!;

  const spawn = level.getRandomSpawnPoint();
  if (spawn) { pos.x = spawn.x; pos.y = spawn.y; }

  if (reason === 'fall') health.max = Math.max(10, health.max - 5);
  health.current = health.max;

  player.velocity && (player.velocity.x = player.velocity.y = 0);
  if (player.bump) player.bump.x = player.bump.y = 0;
  player.hurtTime = reason === 'death' ? 60 : 0;
  player.freezeTime = 0;
  world.removeComponent(player, 'falling');
}
