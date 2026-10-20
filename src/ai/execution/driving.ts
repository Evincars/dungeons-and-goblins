import { FollowPathBehavior, Path, SeekBehavior, SeparationBehavior, Vector3, Vehicle } from 'yuka';
import type { Level } from '../../level/Level';
import type { Entity, Mob } from '../../world';
import { clearLine } from '../perception/navigation';
import { nearby, Sense } from '../perception/spatial';
import { LOOKAHEAD_TILES, PERSONAL_SPACE } from '../constants';
import { walkTowards } from './locomotion';

/**
 * How an enemy walks, built on Yuka's steering behaviours: it follows its route as a path of points,
 * always aiming at the farthest one it can reach in a straight, clear line (so it cuts across open floor
 * instead of stair-stepping tile by tile), or seeks a point it can walk straight to, and in both cases
 * keeps clear of the allies crowding it. The resulting heading becomes a push on its velocity.
 */

/** Waypoints handed to the path behaviour each tick: the far point in sight and the next few tiles. */
const WAYPOINTS = 3;
/** Radius at which a path waypoint counts as reached by Yuka's path follower. */
const NEXT_WAYPOINT_DISTANCE = 8;
/** How strongly allies push apart compared with the pull of the route. */
const SEPARATION_WEIGHT = 0.7;
/** A steering force weaker than this means there is nowhere to go. */
const MIN_FORCE = 1e-4;
const TICK_SECONDS = 1 / 60;

type Body = {
  vehicle: Vehicle;
  path: Path;
  follow: FollowPathBehavior;
  seek: SeekBehavior;
  separation: SeparationBehavior;
  /** Reused every tick, so walking allocates nothing. */
  waypoints: Vector3[];
};
const bodies = new WeakMap<Entity, Body>();
const neighbourPool: Vehicle[] = [];
const crowd: Entity[] = [];
const force = new Vector3();

function bodyOf(mob: Mob): Body {
  let body = bodies.get(mob);
  if (body) return body;
  const vehicle = new Vehicle();
  vehicle.maxSpeed = 2;
  vehicle.maxForce = 4;
  const path = new Path();
  const follow = new FollowPathBehavior(path, NEXT_WAYPOINT_DISTANCE);
  const seek = new SeekBehavior();
  const separation = new SeparationBehavior();
  separation.weight = SEPARATION_WEIGHT;
  vehicle.steering.add(follow);
  vehicle.steering.add(seek);
  vehicle.steering.add(separation);
  body = { vehicle, path, follow, seek, separation, waypoints: Array.from({ length: WAYPOINTS }, () => new Vector3()) };
  bodies.set(mob, body);
  return body;
}

/** Index in the route (from `step`) of the farthest tile centre in clear sight from where the mob stands. */
function farthestInSight(level: Level, mob: Mob, route: readonly number[], step: number): number {
  const last = Math.min(route.length - 1, step + LOOKAHEAD_TILES);
  for (let i = last; i > step; i--) {
    const t = route[i];
    if (clearLine(level, mob.position.x, mob.position.y, level.tileCentreX(t), level.tileCentreY(t))) return i;
  }
  return step;
}

/** Fills the vehicle's neighbours with the other enemies within personal space, from the spatial index. */
function gatherCrowd(mob: Mob, vehicle: Vehicle): void {
  vehicle.neighbors.length = 0;
  let used = 0;
  for (const other of nearby(mob.position.x, mob.position.y, PERSONAL_SPACE, Sense.mob, crowd)) {
    if (other === mob || !other.position) continue;
    const neighbour = neighbourPool[used] ?? (neighbourPool[used] = new Vehicle());
    neighbour.position.set(other.position.x, 0, other.position.y);
    vehicle.neighbors.push(neighbour);
    used++;
  }
}

/** Runs the active behaviours and pushes the mob along the resulting heading; returns whether it moved. */
function applySteering(level: Level, mob: Mob, body: Body): boolean {
  const vehicle = body.vehicle;
  vehicle.position.set(mob.position.x, 0, mob.position.y);
  // Zero velocity makes the forces a pure heading, whatever speed it already has.
  vehicle.velocity.set(0, 0, 0);
  gatherCrowd(mob, vehicle);
  vehicle.steering.calculate(TICK_SECONDS, force);
  if (Math.hypot(force.x, force.z) < MIN_FORCE) return false;
  return walkTowards(level, mob, force.x, force.z);
}

/** Walks one tick along `route` from index `step`; returns whether it moved. */
export function driveRoute(level: Level, mob: Mob, route: readonly number[], step: number): boolean {
  if (step >= route.length) return false;
  const body = bodyOf(mob);
  const aim = farthestInSight(level, mob, route, step);
  // The route as points: the far point in sight, then the next few tiles, so arriving never slows to a stop.
  body.path.clear();
  const end = Math.min(route.length, aim + WAYPOINTS);
  for (let i = aim; i < end; i++) body.path.add(body.waypoints[i - aim].set(level.tileCentreX(route[i]), 0, level.tileCentreY(route[i])));
  body.follow.active = true;
  body.seek.active = false;
  return applySteering(level, mob, body);
}

/** Walks one tick straight toward a point (it must be in clear sight); returns whether it moved. */
export function driveTo(level: Level, mob: Mob, x: number, y: number): boolean {
  const body = bodyOf(mob);
  body.seek.target.set(x, 0, y);
  body.seek.active = true;
  body.follow.active = false;
  return applySteering(level, mob, body);
}
