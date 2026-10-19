import { world } from '../world';
import type { Level } from '../level/Level';
import { createTile, TileType } from '../level/TileType';
import { sound } from '../audio/SoundPlayer';

/** Seals each safe-room door once every living player has crossed into the dungeon. */
export function updateDoors(level: Level): void {
  for (const door of world.with('door', 'position')) {
    const d = door.door!;
    if (d.closed) continue;

    const players = [...world.with('position', 'playerInput', 'health')]
      .filter(p => p.health!.current > 0 && p.respawnTicks === undefined);
    if (players.length === 0) continue;

    const allPast = players.every(p => p.position!.x > d.boundaryX);
    if (!allPast) continue;

    for (const t of d.tiles) {
      level.setTile(t.x, t.y, createTile(TileType.Wall, 0));
    }
    d.closed = true;
    sound.playSound('door_open', door.position!.x, door.position!.y);
  }
}
