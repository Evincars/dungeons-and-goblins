import { q } from '../world';
import type { Player } from '../world';
import { createItemPickup, groundNear, spillMoney } from '../entities/LootFactory';
import type { Floor } from '../entities/LootFactory';
import { applyLoadout, bagItems } from './PlayerActions';

/**
 * Death in a run. A hero who dies — slain, or at the bottom of a pit — stays down where they fell until the party
 * goes deeper: everything they carried and wore, and their purse, is left on the floor for the others to take. While
 * down they get no share of the party's experience or gold, and no say in its votes or loot rolls. Once the whole
 * party is down the run is over (alone, that is the first death). Going deeper brings the fallen back in the next
 * level's safe room with their experience, but no gear and no gold (game/Run.ts `descend`).
 */

/** A fallen hero's purse spills in at most this many coins. */
const PURSE_PIECES = 8;
const drop = { x: 0, y: 0 };

/** Whether a hero is still in the game: on their feet, not down until the party goes deeper. */
export function isStanding(player: Player): boolean {
  return player.health.current > 0;
}

/** How many heroes are still on their feet. */
export function standingHeroes(): number {
  let count = 0;
  for (const player of q.players) if (isStanding(player)) count++;
  return count;
}

/**
 * Whether every hero is down and done falling (the death played out, the bottom of the pit reached): the run is
 * over. Read from the world alone, so a co-op guest's copy says the same as the host's.
 */
export function partyFallen(): boolean {
  let anyone = false;
  for (const player of q.players) {
    if (isStanding(player) || player.respawnTicks !== 0) return false;
    anyone = true;
  }
  return anyone;
}

/**
 * A hero falls: every item in their bag and on their body is set down where they fell (at the pit's edge, for a fall
 * into one), and their gold spills there as coins that stay until somebody picks them up.
 */
export function leaveBelongings(player: Player, floor: Floor): void {
  const at = groundNear(player.position.x, player.position.y, floor, drop);
  for (const item of bagItems(player.inventory ?? [])) createItemPickup(at.x, at.y, item, floor);
  for (const item of Object.values(player.equipped ?? {})) if (item) createItemPickup(at.x, at.y, item, floor);
  applyLoadout(player, { inventory: [], equipped: {} });
  const gold = player.playerStats.gold;
  player.playerStats.gold = 0;
  spillMoney(at.x, at.y, gold, PURSE_PIECES, true);
}
