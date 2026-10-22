import { Rectangle } from 'pixi.js';
import { world, q } from '../world';
import type { Level } from '../level/Level';
import { BoxPool, boxAround } from '../core/geometry';
import { nearby, Sense } from '../ai/perception/spatial';
import type { Entity } from '../world';
import { MAX_MOB_RADIUS } from '../entities/MobFactory';
import { screenToWorld } from '../render/Camera';
import { TileType } from '../level/TileType';
import { AIM_HEIGHT } from '../entities/ProjectileFactory';

type Point = { x: number; y: number };
type Body = (typeof q.physical)['entities'][number];

const EPSILON = 0.01;
/** Speed lost per tick when nothing pushes (unless the entity has its own friction). */
const DEFAULT_FRICTION = 0.4;
/** Knockback fades by this factor per tick. */
const KNOCKBACK_FADE = 0.8;
/** Speeds below this count as standing still. */
const REST_SPEED = 0.01;
/** Sprinting speeds a player up by half. */
const SPRINT_FACTOR = 1.5;

const walkers = world.with('position', 'playerInput', 'playerStats', 'health', 'velocity');

const fromBox = new Rectangle();
/** Every box a body moves among this tick: the level's, then the bodies around it. Reused, never kept. */
const obstacles: Rectangle[] = [];
const bodyBoxes = new BoxPool();
const neighbours: Entity[] = [];
/** Bodies further than this (centre to centre) can't be touched in one tick's move. */
const BODY_REACH = MAX_MOB_RADIUS * 2 + 8;
/** What a moving body bumps into: players, enemies, and the things that stand in the way (chests, the dummy…). */
const BODY_SENSES = Sense.player | Sense.mob | Sense.usable;
const aimPoint = { x: 0, y: 0 };

/** How far `from` may move along x before touching `to`. */
function clampX(from: Rectangle, to: Rectangle, xa: number): number {
  if (to.top >= from.bottom || to.bottom <= from.top) return xa;
  if (xa > 0) {
    const d = to.left - from.right;
    if (d >= 0 && xa > d) return Math.max(0, d - EPSILON);
  } else if (xa < 0) {
    const d = to.right - from.left;
    if (d <= 0 && xa < d) return Math.min(0, d + EPSILON);
  }
  return xa;
}

/** How far `from` may move along y before touching `to`. */
function clampY(from: Rectangle, to: Rectangle, ya: number): number {
  if (to.left >= from.right || to.right <= from.left) return ya;
  if (ya > 0) {
    const d = to.top - from.bottom;
    if (d >= 0 && ya > d) return Math.max(0, d - EPSILON);
  } else if (ya < 0) {
    const d = to.bottom - from.top;
    if (d <= 0 && ya < d) return Math.min(0, d + EPSILON);
  }
  return ya;
}

/** Moves along one axis (the other must be zero) as far as the boxes allow; returns whether it moved. */
function partMove(pos: Point, radius: Point, bbs: readonly Rectangle[], xa: number, ya: number): boolean {
  const from = boxAround(pos.x, pos.y, radius.x, radius.y, fromBox);
  for (const to of bbs) {
    if (from.intersects(to)) continue;
    if (ya === 0) xa = clampX(from, to, xa);
    else if (xa === 0) ya = clampY(from, to, ya);
  }
  if (xa === 0 && ya === 0) return false;
  pos.x += xa;
  pos.y += ya;
  return true;
}

/** Catacomb Snatch's Entity.move: x first, then y, each stopped short of the first box in the way. */
export function move(pos: Point, radius: Point, xa: number, ya: number, bbs: readonly Rectangle[], slide = true): boolean {
  const movedX = partMove(pos, radius, bbs, xa, 0);
  const movedY = partMove(pos, radius, bbs, 0, ya);
  // Without sliding, a diagonal move never reports success (as in the original).
  return (slide || xa === 0 || ya === 0) && (movedX || movedY);
}

function settle(v: Point, factor: number): void {
  v.x *= factor;
  v.y *= factor;
  if (Math.abs(v.x) < REST_SPEED) v.x = 0;
  if (Math.abs(v.y) < REST_SPEED) v.y = 0;
}

/** Mobs can't step into holes: undo the axis that took them over one. */
function keepOutOfHoles(level: Level, entity: Body, fromX: number, fromY: number): void {
  const pos = entity.position;
  if (!entity.ai || level.getTileAt(pos.x, pos.y)?.type !== TileType.Hole) return;
  if (level.getTileAt(pos.x, fromY)?.type !== TileType.Hole) pos.y = fromY;
  else if (level.getTileAt(fromX, pos.y)?.type !== TileType.Hole) pos.x = fromX;
  else { pos.x = fromX; pos.y = fromY; }
  entity.velocity.x = entity.velocity.y = 0;
  if (entity.bump) entity.bump.x = entity.bump.y = 0;
}

/**
 * Whether two bodies keep each other out: anything solid does, except enemies among themselves (they steer
 * apart instead, or a squad would jam in a corridor). Fallen bodies stop nobody.
 */
function blocks(mover: Entity, other: Entity): boolean {
  if (other === mover || !other.blocking || !other.radius || !other.position) return false;
  if ((other.health?.current ?? 1) <= 0 || other.respawnTicks !== undefined || other.falling) return false;
  return !(mover.ai && other.ai);
}

/** The level's boxes round a body, and the boxes of the bodies it must not walk into. */
function obstaclesFor(level: Level, entity: Body): readonly Rectangle[] {
  const { position: p, radius: r } = entity;
  obstacles.length = 0;
  for (const box of level.getClipBBs(p.x, p.y, r.x, r.y)) obstacles.push(box);
  if (!entity.blocking || (entity.health?.current ?? 1) <= 0) return obstacles;
  bodyBoxes.reset();
  for (const other of nearby(p.x, p.y, BODY_REACH, BODY_SENSES, neighbours)) {
    if (!blocks(entity, other) || !other.position || !other.radius) continue;
    obstacles.push(bodyBoxes.around(other.position.x, other.position.y, other.radius.x, other.radius.y));
  }
  return obstacles;
}

/** One tick of velocity plus knockback, clipped against the level and the bodies around it, then friction. */
function moveBody(level: Level, entity: Body): void {
  const { position, velocity, radius, bump } = entity;
  if (entity.respawnTicks !== undefined) {
    velocity.x = velocity.y = 0;
    if (bump) bump.x = bump.y = 0;
    return;
  }
  const frozen = (entity.freezeTime ?? 0) > 0;
  const xa = (frozen ? 0 : velocity.x) + (bump?.x ?? 0);
  const ya = (frozen ? 0 : velocity.y) + (bump?.y ?? 0);
  const fromX = position.x;
  const fromY = position.y;
  move(position, radius, xa, ya, obstaclesFor(level, entity), entity.physicsSlide !== undefined);
  keepOutOfHoles(level, entity, fromX, fromY);
  settle(velocity, entity.friction ?? DEFAULT_FRICTION);
  if (bump) settle(bump, KNOCKBACK_FADE);
}

type Walker = (typeof walkers)['entities'][number];

/** Sprinting drains stamina while moving; letting go of the key (or running dry) recovers it. Returns the speed factor. */
function sprintFactor(walker: Walker, moving: boolean): number {
  const stats = walker.playerStats;
  const held = walker.playerInput.sprint;
  if (!held) stats.sprintLocked = false;
  stats.sprinting = moving && held && !stats.sprintLocked && stats.sprint < stats.maxSprint;
  if (stats.sprinting) {
    stats.sprint++;
    return SPRINT_FACTOR;
  }
  if (moving && held) stats.sprintLocked = true;
  if (stats.sprint > 0) stats.sprint--;
  return 1;
}

/**
 * Aims from hand height, so swings and spell bolts (drawn that high) pass through the crosshair: this
 * screen's pointer for the local player, the crosshair their browser sent for a remote one.
 */
function aimAtPointer(walker: Walker): void {
  const pi = walker.playerInput;
  if (!pi.mouseAiming || !walker.aimVector) return;
  const target = walker.aimWorld ?? screenToWorld(pi.mouseX, pi.mouseY, aimPoint);
  const dx = target.x - walker.position.x;
  const dy = target.y - (walker.position.y - AIM_HEIGHT);
  const len = Math.hypot(dx, dy);
  if (len === 0) return;
  walker.aimVector.x = dx / len;
  walker.aimVector.y = dy / len;
}

/** Turns a player's held keys into a push on their velocity. */
function drivePlayer(walker: Walker): void {
  const pi = walker.playerInput;
  if (walker.respawnTicks !== undefined || walker.health.current <= 0) {
    walker.walkTime = 0;
    return;
  }
  if ((walker.freezeTime ?? 0) > 0) return;
  // Casting roots the caster.
  if (walker.casting) {
    walker.walkTime = 0;
    return;
  }
  const moving = pi.up || pi.down || pi.left || pi.right;
  const spd = (walker.speed ?? 1.0) * sprintFactor(walker, moving);
  const vel = walker.velocity;
  if (pi.up)    vel.y -= spd;
  if (pi.down)  vel.y += spd;
  if (pi.left)  vel.x -= spd;
  if (pi.right) vel.x += spd;
  walker.walkTime = moving ? (walker.walkTime ?? 0) + 1 : 0;
  aimAtPointer(walker);
}

export function updateMovement(level: Level): void {
  for (const entity of q.physical) moveBody(level, entity);
  for (const walker of walkers) drivePlayer(walker);
}
