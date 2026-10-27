import { q, PLAYER_SLOTS } from '../world';
import type { Player } from '../world';
import { isStanding } from './Fallen';
import { seatOf } from './Party';

/**
 * What a fallen hero sees in co-op: their own body where it lies, or — picked with the mouse buttons — one of the
 * companions still on their feet, whose view the screen then follows (and nothing else: a fallen hero does nothing).
 */

/** The standing companions, in seat order (reused: a click allocates nothing). */
const companions: Player[] = [];
const bySeat = (a: Player, b: Player): number => PLAYER_SLOTS.indexOf(seatOf(a)) - PLAYER_SLOTS.indexOf(seatOf(b));

function isCompanion(me: Player, player: Player): boolean {
  return player !== me && isStanding(player) && !player.removed;
}

function standingCompanions(me: Player): readonly Player[] {
  companions.length = 0;
  for (const player of q.players) if (isCompanion(me, player)) companions.push(player);
  // The world lists its newest first: the seats keep the order the same for everyone.
  return companions.sort(bySeat);
}

/** Whether any companion is still on their feet to be watched. */
export function anyoneToWatch(me: Player): boolean {
  for (const player of q.players) if (isCompanion(me, player)) return true;
  return false;
}

/** Whether the companion being watched is still there to watch (in the world and on their feet). */
export function stillWatchable(watched: Player | null): watched is Player {
  return !!watched && isStanding(watched) && !watched.removed && q.players.has(watched);
}

/**
 * The companion to watch after `watched`, `step` along the seats (1: the next, -1: the one before), round and round;
 * from their own body (null) the first or the last. Null when nobody else is standing.
 */
export function nextWatched(me: Player, watched: Player | null, step: 1 | -1): Player | null {
  const list = standingCompanions(me);
  if (!list.length) return null;
  const at = watched ? list.indexOf(watched) : -1;
  if (at < 0) return step > 0 ? list[0] : list[list.length - 1];
  return list[(at + step + list.length) % list.length];
}
