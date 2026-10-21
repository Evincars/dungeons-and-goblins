import { q } from '../world';
import type { Entity } from '../world';

/** One trip into the dungeon: how deep the party has gone. A new run starts from the title screen. */
export const run = {
  depth: 1,
  /** Alone, one death or fall ends the run; the scene sets this when the level starts. */
  hardcore: false,
  /** The run is lost: dying or falling ended it, and the game over screen is up. */
  over: false,
};

/** What a player takes down to the next level: their progress and gear, not their position or wounds. */
type Carry = {
  stats: NonNullable<Entity['playerStats']>;
  inventory: NonNullable<Entity['inventory']>;
  equipped: NonNullable<Entity['equipped']>;
  maxHealth: number;
};

/** Progress of the players in the run so far, by seat. */
const carried = new Map<string, Carry>();

const seatOf = (player: Entity): string => player.playerSlot ?? 'host';

export function startRun(): void {
  run.depth = 1;
  run.over = false;
  carried.clear();
}

/** The exit was taken: the next level lies one deeper, and everyone's progress comes along. */
export function descend(): void {
  for (const player of q.players) {
    carried.set(seatOf(player), {
      stats: structuredClone(player.playerStats),
      inventory: structuredClone(player.inventory ?? []),
      equipped: structuredClone(player.equipped ?? {}),
      maxHealth: player.health.max,
    });
  }
  run.depth++;
}

/** Gives a freshly made player what they earned on the levels before (nothing on the first). */
export function restorePlayer(player: Entity): void {
  const carry = carried.get(seatOf(player));
  if (!carry || !player.playerStats || !player.health) return;
  Object.assign(player.playerStats, structuredClone(carry.stats), { sprinting: false, sprint: 0, sprintLocked: false });
  player.inventory = structuredClone(carry.inventory);
  player.equipped = structuredClone(carry.equipped);
  player.health.max = carry.maxHealth;
  player.health.current = carry.maxHealth;
}
