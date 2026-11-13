import { world, isPlayer } from '../world';
import type { Entity } from '../world';
import type { Level } from '../level/Level';
import { dropPoint } from '../level/PitShapes';
import { spawnExclamation } from '../entities/FxFactory';
import { characterDef, headAboveFeet } from '../characters/Characters';
import { sound } from '../audio/SoundPlayer';
import { leaveBelongings } from '../game/Fallen';

/** Ticks from stepping off the edge to the bottom of the pit; matches the falling cry's length. */
export const FALL_TICKS = 60;
/** How far the sprite sinks into the pit over the fall. */
export const FALL_DEPTH = 48;
/** Half-size of the support box under the feet that must be entirely over a hole to fall. */
const SUPPORT_HALF = 6;
/** Over this many ticks at the start of a fall the faller slides into the pit, this share of the way each tick. */
const PULL_TICKS = 14;
const PULL_RATE = 0.25;

const grounded = world.with('position', 'health');
const fallers = world.with('position', 'falling');

/** Whether there is no floor under a point: inside a pit's drawn shape, or on a loose hole tile. */
function holeAt(level: Level, x: number, y: number): boolean {
  return level.overPit(x, y);
}

/** Feet can overhang an edge while any part of their small support box has floor under it. */
export function overHole(level: Level, entity: Entity): boolean {
  const p = entity.position;
  if (!p) return false;
  const rx = Math.min(SUPPORT_HALF, entity.radius?.x ?? 0);
  const ry = Math.min(SUPPORT_HALF, entity.radius?.y ?? 0);
  return holeAt(level, p.x - rx, p.y - ry) && holeAt(level, p.x - rx, p.y + ry)
    && holeAt(level, p.x + rx, p.y - ry) && holeAt(level, p.x + rx, p.y + ry);
}

/**
 * The player slips over the edge: input stops, a "!" pops up over their head and a cry plays. In a shaped pit they
 * drop towards the middle of the part they stepped into, so they go down inside it rather than beside it.
 */
function startFall(level: Level, player: Entity & { position: { x: number; y: number } }): void {
  const { x, y } = player.position;
  const pit = level.pitAt(x, y);
  const to = pit ? dropPoint(pit, x, y, { x, y }) : null;
  world.addComponent(player, 'falling', to ? { age: 0, duration: FALL_TICKS, toX: to.x, toY: to.y } : { age: 0, duration: FALL_TICKS });
  sound.playSound('falling', x, y);
  const head = player.character ? headAboveFeet(characterDef(player.character.def), player.visual?.scale) : 0;
  spawnExclamation(player, x, y, head, FALL_TICKS);
}

/**
 * Anything that walks onto a hole falls in: mobs are lost, players drop to their death (game/Fallen.ts). The console's
 * god mode walks over pits.
 */
export function updateHoles(level: Level): void {
  for (const entity of grounded) {
    if (entity.removed || entity.respawnTicks !== undefined || entity.godMode || !overHole(level, entity)) continue;
    if (!entity.playerInput) {
      sound.playSound('fall', entity.position.x, entity.position.y);
      world.addComponent(entity, 'removed', true);
    } else if (!entity.falling) {
      startFall(level, entity);
    }
  }
}

/**
 * The bottom of the pit: the hero is dead there, out of sight, and down until the party goes deeper; what they
 * carried is left at the pit's edge.
 */
function hitBottom(player: Entity & { position: { x: number; y: number } }, level: Level): void {
  sound.playSound('fall', player.position.x, player.position.y);
  if (player.health) player.health.current = 0;
  world.addComponent(player, 'respawnTicks', 0);
  if (isPlayer(player)) leaveBelongings(player, level);
}

/** Early in a fall, the faller slides towards the point inside the pit they drop to. */
function slideIn(pos: { x: number; y: number }, fall: { age: number; toX?: number; toY?: number }): void {
  if (fall.toX === undefined || fall.toY === undefined || fall.age > PULL_TICKS) return;
  pos.x += (fall.toX - pos.x) * PULL_RATE;
  pos.y += (fall.toY - pos.y) * PULL_RATE;
}

/** Holds a falling player still while they drop; at the bottom they stay (sunk out of sight). */
export function updateFalling(level: Level): void {
  for (const player of fallers) {
    const fall = player.falling;
    if (fall.age >= fall.duration) continue;
    fall.age++;
    slideIn(player.position, fall);
    player.freezeTime = Math.max(player.freezeTime ?? 0, 2);
    if (player.velocity) player.velocity.x = player.velocity.y = 0;
    if (player.bump) player.bump.x = player.bump.y = 0;
    if (fall.age >= fall.duration) hitBottom(player, level);
  }
}
