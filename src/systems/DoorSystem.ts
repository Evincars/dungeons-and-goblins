import { world, q, isActivePlayer } from '../world';
import type { Level } from '../level/Level';
import { text } from '../core/texts';
import { logLine } from './RollLogSystem';
import { createTile, TileType, TILE_WIDTH, TILE_HEIGHT } from '../level/TileType';
import { sound } from '../audio/SoundPlayer';
import { createGate, GATE_LIFT, GATE_RISE } from '../entities/DungeonFactory';

/** A raised portcullis takes this many ticks to slide up out of sight… */
const GATE_RISE_TICKS = 45;
/** …and one falling back down to shut the safe room this many, as a portcullis drops. */
const GATE_DROP_TICKS = 18;
/** Once open, the gate shuts on the safe room after this long (10 s): whoever is still inside dies. */
export const GATE_CLOSE_TICKS = 600;
/** The exit room's lever drops its portcullis this long after it is pulled (5 s): whoever is still outside stays out. */
export const EXIT_CLOSE_TICKS = 300;
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

/**
 * Bars the doorway again, as it was before the lever: solid, drawn as floor, under its portcullis (once: the
 * dirty flag rebuilds the terrain only when a tile really changes).
 */
function barUp(level: Level, door: Door): void {
  for (const t of door.door.tiles) {
    if (level.getTile(t.x, t.y)?.type !== TileType.Obstacle) level.setTile(t.x, t.y, createTile(TileType.Obstacle, 0));
  }
}

/** The room is shut: the doorway is barred, and its portcullis drops down over it. */
function seal(level: Level, door: Door): void {
  const d = door.door;
  d.closingTicks = null;
  barUp(level, door);
  for (const t of d.tiles) createGate(t.x, t.y, true);
  d.closed = true;
  sound.playSound('door_open', door.position.x, door.position.y);
}

/** Clears the doorway: its tiles become floor again (once: only a tile that really changes is set). */
function clearWay(level: Level, door: Door): void {
  for (const t of door.door.tiles) {
    if (level.getTile(t.x, t.y)?.type !== TileType.Floor) level.setTile(t.x, t.y, createTile(TileType.Floor, 0));
  }
}

type Gate = (typeof gates)['entities'][number];

/** Whether a portcullis stands over one of this door's tiles. */
function guards(door: Door, gate: Gate): boolean {
  const tx = Math.floor(gate.position.x / TILE_WIDTH);
  const ty = Math.floor(gate.position.y / TILE_HEIGHT);
  return door.door.tiles.some((t) => t.x === tx && t.y === ty);
}

/** Every portcullis down over this door starts to rise. */
function raiseGatesOf(door: Door): void {
  for (const gate of gates) if (gate.gate.lift === 0 && guards(door, gate)) gate.gate.lift = 1 / GATE_RISE_TICKS;
}

/** The lever was pulled: the safe room's doorway opens, its portcullis starts to rise, and the countdown to shutting it starts. */
export function unlockDoors(level: Level): void {
  for (const door of doors) {
    if (!door.door.locked) continue;
    door.door.locked = false;
    door.door.closingTicks = GATE_CLOSE_TICKS;
    clearWay(level, door);
    sound.playSound('door_open', door.position.x, door.position.y);
    raiseGatesOf(door);
  }
}

/** The exit room's lever was pulled: its door starts counting down to shutting the room for good. */
export function closeExitDoor(): void {
  for (const door of doors) {
    const d = door.door;
    if (!d.exit || d.closed || d.closingTicks !== null) continue;
    d.closingTicks = EXIT_CLOSE_TICKS;
    sound.playSound('door_open', door.position.x, door.position.y);
  }
}

/** A rising portcullis slides up into the wall and fades; risen, it is gone. */
function raiseGate(gate: Gate): void {
  const g = gate.gate;
  g.lift = Math.min(1, g.lift + 1 / GATE_RISE_TICKS);
  gate.yOffset = GATE_LIFT + g.lift * GATE_RISE;
  if (gate.sprite) gate.sprite.alpha = 1 - g.lift;
  if (g.lift >= 1) world.addComponent(gate, 'removed', true);
}

/** A dropping portcullis slams down out of the wall onto the doorway, and stays there. */
function dropGate(gate: Gate): void {
  const g = gate.gate;
  g.lift = Math.max(0, g.lift - 1 / GATE_DROP_TICKS);
  gate.yOffset = GATE_LIFT + g.lift * GATE_RISE;
  if (g.lift === 0) g.dropping = false;
}

/** Portcullises on the move: rising out of the way, or dropping back down. */
function moveGates(): void {
  for (const gate of gates) {
    if (gate.removed) continue;
    if (gate.gate.dropping) dropGate(gate);
    else if (gate.gate.lift > 0) raiseGate(gate);
  }
}

/** Co-op guest: this copy of the terrain follows the host's door — barred, open, or barred again behind the party. */
export function mirrorSealedDoors(level: Level): void {
  for (const door of doors) {
    if (door.door.closed) barUp(level, door);
    else if (!door.door.locked) clearWay(level, door);
  }
  // A rising portcullis fades as it goes; a dropping one is solid all the way down.
  for (const gate of gates) if (gate.sprite) gate.sprite.alpha = gate.gate.dropping ? 1 : 1 - gate.gate.lift;
}

/** The gate shut on whoever stayed in the safe room: they die there (unless the console made them a god). */
function crushStragglers(boundaryX: number): void {
  for (const p of q.players) {
    if (!isActivePlayer(p) || p.position.x > boundaryX || p.godMode) continue;
    p.health.current = 0;
    logLine(p, text('roll.crushed'), 'fumble');
  }
}

/** Seconds left until a door counting down shuts (the safe room's, or the exit room's when `exit`); null when none is. */
function countdown(exit: boolean): number | null {
  for (const door of doors) {
    const left = door.door.closingTicks;
    if (left !== null && !door.door.closed && !!door.door.exit === exit) return Math.ceil(left / TICKS_PER_SECOND);
  }
  return null;
}

/** Seconds left until an open gate shuts on the safe room, while one is counting down (for the banner); null otherwise. */
export function gateCountdown(): number | null {
  return countdown(false);
}

/** Seconds left until the exit room's portcullis drops, once its lever is pulled (for the banner); null otherwise. */
export function exitCountdown(): number | null {
  return countdown(true);
}

/** The exit room's door, once its lever is pulled: its seconds run out and it shuts, whoever is inside or not. */
function updateExitDoor(level: Level, door: Door): void {
  const d = door.door;
  if (d.closed || d.closingTicks === null || --d.closingTicks > 0) return;
  seal(level, door);
}

/**
 * Raises unlocked gates, and seals the safe room's opened door once every living player has crossed into the
 * dungeon — or when its ten seconds are up, on whoever is still inside; shuts the exit room's when its time is up.
 */
export function updateDoors(level: Level): void {
  moveGates();
  for (const door of doors) {
    const d = door.door;
    if (d.exit) {
      updateExitDoor(level, door);
      continue;
    }
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
