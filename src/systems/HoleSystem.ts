import { world, isPlayer } from '../world';
import type { Entity } from '../world';
import type { Level } from '../level/Level';
import { TileType, TILE_HEIGHT, TILE_WIDTH, WALL_SINK } from '../level/TileType';
import { dropPoint } from '../level/PitShapes';
import { spawnExclamation } from '../entities/FxFactory';
import { characterDef, headAboveFeet } from '../characters/Characters';
import { sound } from '../audio/SoundPlayer';
import { leaveBelongings } from '../game/Fallen';
import { characterSheet } from '../rules/CharacterSheet';
import { playEffect } from '../assets/Effects';

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

/** A leaper (Athlete, Mobile) clears a pit this wide at most (px), looking for the far side in steps this long. */
const LEAP_REACH = 128;
const LEAP_STEP = 4;
const LEAP_EFFECT = { shape: 'sparkle_ring', colour: 'white', scale: 0.6 } as const;
/** Where each hero last stood on firm floor: a leaper who can't clear a pit springs back there. */
const footing = new WeakMap<Entity, { x: number; y: number }>();

/**
 * Whether there is no floor under a point: inside a pit's drawn shape, or on a loose hole tile, but not in the strip of
 * a chasm's north edge that feet reach over (as over a wall's, Level's WALL_SINK): they stand on its rim there.
 */
function holeAt(level: Level, x: number, y: number): boolean {
  if (!level.overPit(x, y)) return false;
  const tx = Math.floor(x / TILE_WIDTH);
  const ty = Math.floor(y / TILE_HEIGHT);
  // Off the south edge of a bridge there is no rim: its planks end where the dark begins.
  const north = tx + (ty - 1) * level.width;
  const rimmed = level.getTile(tx, ty - 1)?.type === TileType.Floor && !level.bridges.has(north);
  const onRim = level.isChasm(tx, ty) && rimmed && y - ty * TILE_HEIGHT < WALL_SINK;
  return !onRim;
}

/**
 * Feet can overhang an edge while any part of their small support box has floor under it; but a mine's hole is no wider
 * than a body, so whoever's feet are over its dark falls in.
 */
export function overHole(level: Level, entity: Entity): boolean {
  const p = entity.position;
  if (!p) return false;
  if (level.pitAt(p.x, p.y)?.shape === 'hole') return true;
  const rx = Math.min(SUPPORT_HALF, entity.radius?.x ?? 0);
  const ry = Math.min(SUPPORT_HALF, entity.radius?.y ?? 0);
  return holeAt(level, p.x - rx, p.y - ry) && holeAt(level, p.x - rx, p.y + ry)
    && holeAt(level, p.x + rx, p.y - ry) && holeAt(level, p.x + rx, p.y + ry);
}

/** Remembers where a hero stands on firm floor, for a leap that falls short. */
function keepFooting(entity: Entity & { position: { x: number; y: number } }): void {
  if (!entity.playerInput) return;
  const at = footing.get(entity);
  if (at) {
    at.x = entity.position.x;
    at.y = entity.position.y;
  } else {
    footing.set(entity, { x: entity.position.x, y: entity.position.y });
  }
}

/** Whether a body could stand at (x, y): floor under it and no wall at its feet. */
function firm(level: Level, entity: Entity, x: number, y: number): boolean {
  return !level.blocksPoint(x, y) && !overHole(level, { position: { x, y }, radius: entity.radius });
}

/**
 * Athlete and Mobile: a hero who steps over a pit's edge never falls in. They leap on the way they were going to the far
 * side, if it lies within reach; otherwise they spring back to where they last stood.
 */
function leap(level: Level, player: Entity & { position: { x: number; y: number } }): void {
  const from = footing.get(player) ?? { x: player.position.x, y: player.position.y };
  const { x, y } = player.position;
  const dx = x - from.x;
  const dy = y - from.y;
  const len = Math.hypot(dx, dy);
  const landing = len > 0 ? farSide(level, player, dx / len, dy / len) : null;
  player.position.x = landing?.x ?? from.x;
  player.position.y = landing?.y ?? from.y;
  if (player.velocity) player.velocity.x = player.velocity.y = 0;
  playEffect(LEAP_EFFECT.shape, LEAP_EFFECT.colour, player.position.x, player.position.y, 0, LEAP_EFFECT.scale);
}

/** The first firm spot past the pit along (ux, uy), within a leap's reach; null when the far side is too far. */
function farSide(level: Level, player: Entity & { position: { x: number; y: number } }, ux: number, uy: number): { x: number; y: number } | null {
  for (let d = LEAP_STEP; d <= LEAP_REACH; d += LEAP_STEP) {
    const x = player.position.x + ux * d;
    const y = player.position.y + uy * d;
    if (level.blocksPoint(x, y)) return null;
    if (firm(level, player, x, y)) return { x, y };
  }
  return null;
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
    if (entity.removed || entity.respawnTicks !== undefined || entity.godMode) continue;
    if (!overHole(level, entity)) {
      keepFooting(entity);
      continue;
    }
    if (isPlayer(entity) && !entity.falling && characterSheet(entity).feats.pitLeap) {
      leap(level, entity);
    } else if (!entity.playerInput) {
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
