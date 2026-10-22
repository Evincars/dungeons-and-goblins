import { isPlayer, q, world } from '../../world';
import type { Mob, Player } from '../../world';
import { DROPPED_CALM_TICKS, MAX_SQUAD } from '../constants';

/**
 * A squad is every enemy fighting (or tracking) the same player. Squads are re-formed each tick from the enemies'
 * own state, so nothing has to be kept in step when one dies or gives up. Members share what they know:
 * if any of them sees the target, all of them know where it is — that is what lets a flanker slip out
 * of sight round the block without losing the hunt.
 */
export type Squad = {
  target: Player;
  targetId: number;
  /** Members, nearest to the target first. */
  members: Mob[];
  /** Member taking the target head on, once roles are assigned. */
  leadId: number | undefined;
  flankers: number;
  /** Member count when roles were last assigned; a change means they are assigned again. */
  assignedSize: number;
};

const squads = new Map<number, Squad>();
/** Squad objects are reused tick to tick (an object pool keyed by target). */
const pool = new Map<number, Squad>();
const dropped: Mob[] = [];

let sortTarget: Player | null = null;
function distToTarget(m: Mob): number {
  if (!sortTarget) return 0;
  return (m.position.x - sortTarget.position.x) ** 2 + (m.position.y - sortTarget.position.y) ** 2;
}
const nearestFirst = (a: Mob, b: Mob): number => distToTarget(a) - distToTarget(b);

function squadFor(target: Player, targetId: number): Squad {
  let squad = squads.get(targetId);
  if (squad) return squad;
  squad = pool.get(targetId) ?? { target, targetId, members: [], leadId: undefined, flankers: 0, assignedSize: 0 };
  squad.target = target;
  squad.members.length = 0;
  pool.set(targetId, squad);
  squads.set(targetId, squad);
  return squad;
}

/** Puts an enemy back to wandering, ignoring players for a while (it was crowded out of a fight). */
function stand(mob: Mob): void {
  mob.ai.targetId = undefined;
  mob.ai.allyId = undefined;
  mob.ai.calmTicks = DROPPED_CALM_TICKS;
  dropped.push(mob);
}

/** Members beyond MAX_SQUAD (the farthest) leave the fight. */
function trim(squad: Squad): void {
  sortTarget = squad.target;
  squad.members.sort(nearestFirst);
  sortTarget = null;
  for (let i = MAX_SQUAD; i < squad.members.length; i++) stand(squad.members[i]);
  if (squad.members.length > MAX_SQUAD) squad.members.length = MAX_SQUAD;
}

/** Every member learns the squad's freshest sighting of the target. */
function shareSightings(squad: Squad): void {
  let freshest = squad.members[0];
  for (const m of squad.members) if (m.ai.lastSeenTick > freshest.ai.lastSeenTick) freshest = m;
  for (const m of squad.members) {
    m.ai.lastSeenTick = freshest.ai.lastSeenTick;
    m.ai.lastSeenX = freshest.ai.lastSeenX;
    m.ai.lastSeenY = freshest.ai.lastSeenY;
  }
}

/**
 * Re-forms the squads from the enemies that are fighting. Enemies crowded out of a squad are returned in
 * `droppedThisTick()` so the caller can send them back to idling.
 */
export function formSquads(): ReadonlyMap<number, Squad> {
  squads.clear();
  dropped.length = 0;
  for (const mob of q.walkingMobs) {
    const id = mob.ai.targetId;
    if ((mob.ai.state !== 'engage' && mob.ai.state !== 'search') || id === undefined) continue;
    const target = world.entity(id);
    if (!isPlayer(target)) continue;
    squadFor(target, id).members.push(mob);
  }
  for (const squad of squads.values()) {
    trim(squad);
    shareSightings(squad);
  }
  return squads;
}

/** The squad hunting a player this tick, if any. */
export function squadOf(targetId: number | undefined): Squad | undefined {
  return targetId === undefined ? undefined : squads.get(targetId);
}

export function droppedThisTick(): readonly Mob[] {
  return dropped;
}
