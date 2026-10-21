import { world, q, isActivePlayer } from '../world';
import type { Level } from '../level/Level';
import { createTile, TileType, TILE_WIDTH, TILE_HEIGHT } from '../level/TileType';
import { sound } from '../audio/SoundPlayer';

/** Once sealed, players respawn this many tiles past the door, on the dungeon side. */
const RESPAWN_TILES_PAST_DOOR = 2;

const doors = world.with('door', 'position');
type Door = (typeof doors)['entities'][number];

/** Whether every living player has crossed the door's boundary (and there is at least one). */
function everyoneLeft(boundaryX: number): boolean {
  let anyone = false;
  for (const p of q.players) {
    if (!isActivePlayer(p)) continue;
    if (p.position.x <= boundaryX) return false;
    anyone = true;
  }
  return anyone;
}

/** Walls the doorway up (once: the dirty flag rebuilds the terrain only when a tile really changes). */
function wallUp(level: Level, door: Door): void {
  for (const t of door.door.tiles) {
    if (level.getTile(t.x, t.y)?.type !== TileType.Wall) level.setTile(t.x, t.y, createTile(TileType.Wall, 0));
  }
}

function seal(level: Level, door: Door): void {
  const d = door.door;
  wallUp(level, door);
  // The safe room is now unreachable, so respawn just past the door instead.
  const mid = d.tiles[Math.floor(d.tiles.length / 2)];
  level.setSpawnPoint((mid.x + RESPAWN_TILES_PAST_DOOR) * TILE_WIDTH + TILE_WIDTH / 2, mid.y * TILE_HEIGHT + TILE_HEIGHT / 2);
  d.closed = true;
  sound.playSound('door_open', door.position.x, door.position.y);
}

/** Co-op guest: the host sealed a door, so this copy of the terrain walls it up too. */
export function mirrorSealedDoors(level: Level): void {
  for (const door of doors) {
    if (door.door.closed) wallUp(level, door);
  }
}

/** Seals each safe-room door once every living player has crossed into the dungeon. */
export function updateDoors(level: Level): void {
  for (const door of doors) {
    if (!door.door.closed && everyoneLeft(door.door.boundaryX)) seal(level, door);
  }
}
