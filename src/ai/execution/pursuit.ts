import type { Level } from '../../level/Level';
import { TILE_WIDTH } from '../../level/TileType';
import { isMob, world } from '../../world';
import type { Mob, Player, Trail } from '../../world';
import {
  ASSIST_RADIUS, FLANK_DETOUR_SLACK, FLANK_DISTANCE, FLANK_MAX_DETOUR, FLANK_SNAP_TILES, LOOKAHEAD_TILES,
  REPATH_TICKS, SENSE_TICKS, SPLIT_DETOUR_SLACK, SPLIT_MAX_DETOUR, STRIKE_RANGE, TRAIL_LOOKAHEAD,
} from '../constants';
import { clearLine, mobRoute, nearestStandable, standable } from '../perception/navigation';
import { crumbAfter, crumbCount, crumbTick, crumbX, crumbY } from '../perception/trail';
import { squadOf } from '../decision/squads';
import type { Squad } from '../decision/squads';
import { driveRoute, driveTo } from './driving';

/**
 * Carrying out a role: where an engaged enemy walks this tick, and how it hunts along a trail. Routes come
 * from Yuka's A* and are re-planned every REPATH_TICKS; anything in a straight, clear line is walked
 * straight at.
 */

/** Tiles marked for a flanker's route search to avoid (the lead attacker's lane), and which ones are set. */
let lane = new Uint8Array(0);
const marked: number[] = [];
/** Spacing of the samples taken along the lead attacker's straight line to the target. */
const LANE_SAMPLE = 16;
const LANE_DIRS = [[0, 0], [0, -1], [1, 0], [0, 1], [-1, 0]] as const;

type Point = { x: number; y: number };
/** Where a flanker believes its target is, reused every tick. */
const flankTarget: Point = { x: 0, y: 0 };

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function resetRoute(mob: Mob): void {
  mob.ai.route = [];
  mob.ai.step = 0;
  mob.ai.routeGoal = -1;
}

/** Drops route tiles already reached (it may have cut a corner past a few). */
function advanceStep(level: Level, mob: Mob): void {
  const ai = mob.ai;
  const here = level.tileIndexAt(mob.position.x, mob.position.y);
  const last = Math.min(ai.route.length - 1, ai.step + LOOKAHEAD_TILES);
  for (let i = last; i >= ai.step; i--) {
    if (ai.route[i] !== here) continue;
    ai.step = i + 1;
    return;
  }
}

/**
 * Marks the routes of the squad mates nearer the target than this enemy (they picked their ways first);
 * returns the marks, or null when none of them is on a route.
 */
function markMatesRoutes(level: Level, mob: Mob): Uint8Array | null {
  const squad = squadOf(mob.ai.targetId);
  if (!squad) return null;
  if (lane.length !== level.width * level.height) lane = new Uint8Array(level.width * level.height);
  for (const mate of squad.members) {
    if (mate === mob) break;
    for (let i = mate.ai.step; i < mate.ai.route.length; i++) {
      const t = mate.ai.route[i];
      markLaneTile(level, t % level.width, Math.floor(t / level.width));
    }
  }
  return marked.length > 0 ? lane : null;
}

/**
 * The way to `goal`: the shortest, unless squad mates nearer the target already take it — then another way
 * round, so a player behind a wall is come at from both sides. A far longer detour is not worth it.
 */
function squadRoute(level: Level, mob: Mob, from: number, goal: number): number[] {
  const shortest = mobRoute(level, from, goal);
  const taken = markMatesRoutes(level, mob);
  if (!taken) return shortest;
  const other = mobRoute(level, from, goal, taken);
  clearLane();
  return other.length <= shortest.length * SPLIT_MAX_DETOUR + SPLIT_DETOUR_SLACK ? other : shortest;
}

/** Walks toward a tile by route, planning one when due; `avoid` makes the route keep off those tiles. Returns whether it moved. */
function walkToTile(level: Level, mob: Mob, goal: number, avoid: Uint8Array | null = null): boolean {
  const ai = mob.ai;
  ai.repathIn--;
  const exhausted = ai.step >= ai.route.length;
  if (ai.repathIn <= 0 || (exhausted && ai.routeGoal !== goal)) {
    const from = level.tileIndexAt(mob.position.x, mob.position.y);
    ai.route = avoid ? mobRoute(level, from, goal, avoid) : squadRoute(level, mob, from, goal);
    ai.step = 0;
    ai.routeGoal = goal;
    ai.repathIn = REPATH_TICKS;
  }
  advanceStep(level, mob);
  if (driveRoute(level, mob, ai.route, ai.step)) return true;
  // Pushed off its route or blocked by a pit: plan again next tick.
  ai.repathIn = 0;
  return false;
}

/** How far, in tiles, an enemy looks for ground to stand on near a target that stands on none (feet can sink into a wall's edge). */
const STANDABLE_SEARCH_TILES = 2;

/**
 * Walks to a point on ground enemies can stand on: by route, then the last bit straight at the point. A route
 * only ends at the tile's centre, which can fall short of a player pressed against a wall, and there is nothing
 * to follow once the enemy is on that tile (or when no route exists); walking straight at the point beats standing still.
 */
function walkToGoalTile(level: Level, mob: Mob, goal: number, x: number, y: number): void {
  if (level.tileIndexAt(mob.position.x, mob.position.y) !== goal && walkToTile(level, mob, goal)) return;
  resetRoute(mob);
  driveTo(level, mob, x, y);
}

/**
 * Walks to a point: straight at it when the way is clear, otherwise by route. A point on a tile enemies
 * can't stand on (a player pressed against a wall) is reached by routing to the nearest ground, then
 * walking the last bit straight at it.
 */
function walkToPoint(level: Level, mob: Mob, x: number, y: number): void {
  if (clearLine(level, mob.position.x, mob.position.y, x, y)) {
    resetRoute(mob);
    driveTo(level, mob, x, y);
    return;
  }
  const goal = level.tileIndexAt(x, y);
  if (standable(level, goal)) {
    walkToGoalTile(level, mob, goal, x, y);
    return;
  }
  const ground = nearestStandable(level, x, y, STANDABLE_SEARCH_TILES);
  if (ground < 0) return;
  // An enemy's own feet can sink into the wall edge too; that counts as having arrived, or it would
  // turn back to the ground tile's centre and then press on again, forever.
  const here = level.tileIndexAt(mob.position.x, mob.position.y);
  if (here !== ground && standable(level, here)) {
    walkToTile(level, mob, ground);
    return;
  }
  resetRoute(mob);
  driveTo(level, mob, x, y);
}

/**
 * Where the target is as far as the enemy knows: right where it stands when the squad has just seen it,
 * otherwise where it was last seen.
 */
function knownTargetX(mob: Mob, target: Player, tick: number): number {
  return tick - mob.ai.lastSeenTick <= SENSE_TICKS ? target.position.x : mob.ai.lastSeenX;
}

function knownTargetY(mob: Mob, target: Player, tick: number): number {
  return tick - mob.ai.lastSeenTick <= SENSE_TICKS ? target.position.y : mob.ai.lastSeenY;
}

/** Straight at the player: the lead attacker's role, and how everyone fights once close. */
export function strike(level: Level, mob: Mob, target: Player, tick: number): void {
  walkToPoint(level, mob, knownTargetX(mob, target, tick), knownTargetY(mob, target, tick));
}

// ── Flanking ──────────────────────────────────────────────────────────────────

function markLaneTile(level: Level, tx: number, ty: number): void {
  for (const [dx, dy] of LANE_DIRS) {
    const x = tx + dx;
    const y = ty + dy;
    if (x < 0 || y < 0 || x >= level.width || y >= level.height || lane[x + y * level.width] === 1) continue;
    lane[x + y * level.width] = 1;
    marked.push(x + y * level.width);
  }
}

/** Marks the lead attacker's lane, its route and its straight line to the target, each a tile wide either side. */
function markLane(level: Level, lead: Mob, target: Point): Uint8Array {
  if (lane.length !== level.width * level.height) lane = new Uint8Array(level.width * level.height);
  for (let i = lead.ai.step; i < lead.ai.route.length; i++) {
    const t = lead.ai.route[i];
    markLaneTile(level, t % level.width, Math.floor(t / level.width));
  }
  const samples = Math.ceil(dist(lead.position, target) / LANE_SAMPLE);
  for (let i = 0; i <= samples; i++) {
    const x = lead.position.x + ((target.x - lead.position.x) * i) / Math.max(1, samples);
    const y = lead.position.y + ((target.y - lead.position.y) * i) / Math.max(1, samples);
    const t = level.tileIndexAt(x, y);
    markLaneTile(level, t % level.width, Math.floor(t / level.width));
  }
  return lane;
}

function clearLane(): void {
  for (const t of marked) lane[t] = 0;
  marked.length = 0;
}

/** The tile behind the target as seen from the lead attacker, where a flanker takes it in the back; -1 if none. */
export function flankGoal(level: Level, lead: Point, target: Point): number {
  const d = dist(lead, target) || 1;
  const ux = (target.x - lead.x) / d;
  const uy = (target.y - lead.y) / d;
  const far = nearestStandable(level, target.x + ux * FLANK_DISTANCE, target.y + uy * FLANK_DISTANCE, FLANK_SNAP_TILES);
  if (far >= 0) return far;
  return nearestStandable(level, target.x + (ux * FLANK_DISTANCE) / 2, target.y + (uy * FLANK_DISTANCE) / 2, FLANK_SNAP_TILES);
}

/** Whether a flank route is so much longer than walking straight there that flanking is not worth it. */
function detourTooLong(mob: Mob, target: Point): boolean {
  const straightTiles = (Math.abs(target.x - mob.position.x) + Math.abs(target.y - mob.position.y)) / TILE_WIDTH;
  return mob.ai.route.length > straightTiles * FLANK_MAX_DETOUR + FLANK_DETOUR_SLACK;
}

/** Plans a route round the block to the flank spot, keeping off the lead attacker's lane. */
function planFlank(level: Level, mob: Mob, lead: Mob, goal: number, target: Point): void {
  const avoid = markLane(level, lead, target);
  mob.ai.route = mobRoute(level, level.tileIndexAt(mob.position.x, mob.position.y), goal, avoid);
  clearLane();
  mob.ai.step = 0;
  mob.ai.routeGoal = goal;
  mob.ai.repathIn = REPATH_TICKS;
}

/**
 * Round the block to the player's back while the lead attacker keeps them busy. A flanker strikes once it
 * is behind them or close enough; with no lead to flank around, or no way round, it attacks directly.
 */
export function flank(level: Level, mob: Mob, squad: Squad | undefined, target: Player, tick: number): void {
  const lead = squad?.leadId === undefined ? undefined : world.entity(squad.leadId);
  const point = flankTarget;
  point.x = knownTargetX(mob, target, tick);
  point.y = knownTargetY(mob, target, tick);
  const goal = isMob(lead) && lead !== mob ? flankGoal(level, lead.position, point) : -1;
  const here = level.tileIndexAt(mob.position.x, mob.position.y);
  if (!isMob(lead) || goal < 0 || here === goal || dist(mob.position, point) <= STRIKE_RANGE) {
    strike(level, mob, target, tick);
    return;
  }
  mob.ai.repathIn--;
  if (mob.ai.repathIn <= 0 || mob.ai.routeGoal !== goal) planFlank(level, mob, lead, goal, point);
  if (mob.ai.route.length === 0 || detourTooLong(mob, point)) {
    mob.ai.role = 'direct';
    strike(level, mob, target, tick);
    return;
  }
  advanceStep(level, mob);
  if (!driveRoute(level, mob, mob.ai.route, mob.ai.step)) mob.ai.repathIn = 0;
}

// ── Support ───────────────────────────────────────────────────────────────────

/** Over to an engaged ally that needs help; once beside it (or near the player) it joins the fight. */
export function support(level: Level, mob: Mob, target: Player, tick: number): void {
  const ally = mob.ai.allyId === undefined ? undefined : world.entity(mob.ai.allyId);
  const helping = isMob(ally) && ally.ai.state === 'engage' && ally.health.current > 0;
  if (!helping) mob.ai.role = 'direct';
  const arrived = !helping || dist(mob.position, ally.position) <= ASSIST_RADIUS;
  if (arrived || dist(mob.position, target.position) <= STRIKE_RANGE) {
    strike(level, mob, target, tick);
    return;
  }
  walkToPoint(level, mob, ally.position.x, ally.position.y);
}

// ── Trail following ───────────────────────────────────────────────────────────

/**
 * Marks crumbs passed: within the look-ahead window from `i`, the last one the enemy stands on (it may
 * have cut a corner past the ones before it) or cannot stand on. Returns the first crumb still ahead, or
 * -1 when it has walked the whole trail.
 */
function passCrumbs(level: Level, mob: Mob, trail: Trail, i: number): number {
  const here = level.tileIndexAt(mob.position.x, mob.position.y);
  const last = Math.min(crumbCount(trail) - 1, i + TRAIL_LOOKAHEAD);
  let next = i;
  for (let k = i; k <= last; k++) {
    const tile = level.tileIndexAt(crumbX(trail, k), crumbY(trail, k));
    if (tile !== here && standable(level, tile)) continue;
    mob.ai.trailTick = crumbTick(trail, k);
    next = k + 1;
  }
  return next < crumbCount(trail) ? next : -1;
}

/** The farthest crumb within TRAIL_LOOKAHEAD of `i` the enemy can walk straight to, to cut corners along the path. */
function farthestCrumbInSight(level: Level, mob: Mob, trail: Trail, i: number): number {
  const last = Math.min(crumbCount(trail) - 1, i + TRAIL_LOOKAHEAD);
  for (let j = last; j > i; j--) {
    if (clearLine(level, mob.position.x, mob.position.y, crumbX(trail, j), crumbY(trail, j))) return j;
  }
  return i;
}

/**
 * Follows the player's trail from where they were last seen, crumb by crumb, the way they actually went.
 * With no crumb dropped since then it walks to where they were last seen. Returns false once there is
 * nothing left to follow.
 */
export function followTrail(level: Level, mob: Mob, target: Player | undefined): boolean {
  const trail = target?.trail;
  const first = trail ? crumbAfter(trail, mob.ai.trailTick) : -1;
  if (!trail || first < 0) return walkToLastSeen(level, mob);
  const i = passCrumbs(level, mob, trail, first);
  if (i < 0) return false;
  const j = farthestCrumbInSight(level, mob, trail, i);
  walkToPoint(level, mob, crumbX(trail, j), crumbY(trail, j));
  return true;
}

/**
 * Searching squad mates who are not the tracker cut the player off instead: they head for where the trail
 * now ends, each by another way round (see squadRoute). Returns false when there is no trail to cut off.
 */
export function cutOff(level: Level, mob: Mob, target: Player | undefined): boolean {
  const trail = target?.trail;
  const squad = squadOf(mob.ai.targetId);
  if (!trail || !squad || squad.members[0] === mob || crumbCount(trail) === 0) return false;
  const last = crumbCount(trail) - 1;
  walkToPoint(level, mob, crumbX(trail, last), crumbY(trail, last));
  return true;
}

/** Walks to where the target was last seen; false once there (or when it cannot get there). */
function walkToLastSeen(level: Level, mob: Mob): boolean {
  const goal = level.tileIndexAt(mob.ai.lastSeenX, mob.ai.lastSeenY);
  if (goal === level.tileIndexAt(mob.position.x, mob.position.y) || !standable(level, goal)) return false;
  walkToPoint(level, mob, mob.ai.lastSeenX, mob.ai.lastSeenY);
  return true;
}
