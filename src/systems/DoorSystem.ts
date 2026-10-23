import { world, q, isActivePlayer } from '../world';
import type { Level } from '../level/Level';
import { text } from '../core/texts';
import { logLine } from './RollLogSystem';
import { createTile, TileType, TILE_WIDTH, TILE_HEIGHT } from '../level/TileType';
import { sound } from '../audio/SoundPlayer';
import { GATE_LIFT } from '../entities/DungeonFactory';

/** Once sealed, players respawn this many tiles past the door, on the dungeon side. */
const RESPAWN_TILES_PAST_DOOR = 2;
/** A raised portcullis takes this many ticks to slide up out of sight, rising this far. */
const GATE_RISE_TICKS = 45;
const GATE_RISE = 34;
/** Once open, the gate shuts on the safe room after this long (10 s): whoever is still inside dies. */
export const GATE_CLOSE_TICKS = 600;
const TICKS_PER_SECOND = 60;

const doors = world.with('door', 'position');
const gates = world.with('gate', 'position');
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
  d.closingTicks = null;
  wallUp(level, door);
  // The safe room is now unreachable, so respawn just past the door instead.
  const mid = d.tiles[Math.floor(d.tiles.length / 2)];
  level.setSpawnPoint((mid.x + RESPAWN_TILES_PAST_DOOR) * TILE_WIDTH + TILE_WIDTH / 2, mid.y * TILE_HEIGHT + TILE_HEIGHT / 2);
  d.closed = true;
  sound.playSound('door_open', door.position.x, door.position.y);
}

/** Clears the doorway: its tiles become floor again (once: only a tile that really changes is set). */
function clearWay(level: Level, door: Door): void {
  for (const t of door.door.tiles) {
    if (level.getTile(t.x, t.y)?.type !== TileType.Floor) level.setTile(t.x, t.y, createTile(TileType.Floor, 0));
  }
}

/** The lever was pulled: the doorway opens, every portcullis starts to rise, and the countdown to shutting it starts. */
export function unlockDoors(level: Level): void {
  for (const door of doors) {
    if (!door.door.locked) continue;
    door.door.locked = false;
    door.door.closingTicks = GATE_CLOSE_TICKS;
    clearWay(level, door);
    sound.playSound('door_open', door.position.x, door.position.y);
  }
  for (const gate of gates) if (gate.gate.lift === 0) gate.gate.lift = 1 / GATE_RISE_TICKS;
}

/** Rising portcullises slide up and fade; risen ones are gone. */
function raiseGates(): void {
  for (const gate of gates) {
    const g = gate.gate;
    if (g.lift <= 0 || gate.removed) continue;
    g.lift = Math.min(1, g.lift + 1 / GATE_RISE_TICKS);
    gate.yOffset = GATE_LIFT + g.lift * GATE_RISE;
    if (gate.sprite) gate.sprite.alpha = 1 - g.lift;
    if (g.lift >= 1) world.addComponent(gate, 'removed', true);
  }
}

/** Co-op guest: this copy of the terrain follows the host's door — barred, open, or walled up behind the party. */
export function mirrorSealedDoors(level: Level): void {
  for (const door of doors) {
    if (door.door.closed) wallUp(level, door);
    else if (!door.door.locked) clearWay(level, door);
  }
  for (const gate of gates) if (gate.sprite) gate.sprite.alpha = 1 - gate.gate.lift;
}

/** The gate shut on whoever stayed in the safe room: they die there (unless the console made them a god). */
function crushStragglers(boundaryX: number): void {
  for (const p of q.players) {
    if (!isActivePlayer(p) || p.position.x > boundaryX || p.godMode) continue;
    p.health.current = 0;
    logLine(p, text('roll.crushed'), 'fumble');
  }
}

/** Seconds left until an open gate shuts on the safe room, while one is counting down (for the banner); null otherwise. */
export function gateCountdown(): number | null {
  for (const door of doors) {
    const left = door.door.closingTicks;
    if (left !== null && !door.door.closed) return Math.ceil(left / TICKS_PER_SECOND);
  }
  return null;
}

/**
 * Raises unlocked gates, and seals each opened door once every living player has crossed into the dungeon —
 * or when its ten seconds are up, on whoever is still inside.
 */
export function updateDoors(level: Level): void {
  raiseGates();
  for (const door of doors) {
    const d = door.door;
    if (d.closed || d.locked) continue;
    if (everyoneLeft(d.boundaryX)) {
      seal(level, door);
      continue;
    }
    if (d.closingTicks === null || --d.closingTicks > 0) continue;
    crushStragglers(d.boundaryX);
    seal(level, door);
  }
}
