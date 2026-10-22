import { q } from '../world';
import type { Entity, InventoryItem } from '../world';
import { ARMORS, HAND_WEAPONS, SHIELDS } from '../entities/ItemCatalog';
import { WEAPON_BASES } from '../rules/WeaponTable';
import { ARMOR_BASES } from '../rules/ArmorTable';
import type { ItemBase } from '../rules/Equipment';

/** A fresh copy of the first catalogue entry of each of these D&D bases (in that order), skipping any the catalogue lacks. */
function onePerBase(from: readonly InventoryItem[], bases: readonly ItemBase[]): InventoryItem[] {
  return bases.flatMap((base) => {
    const item = from.find((entry) => entry.base === base);
    return item ? [structuredClone(item)] : [];
  });
}

/**
 * What everyone sets out with, to try the rules on: one weapon of every type (dagger, longsword, longbow…),
 * a shield and one suit of every armour type, so each Armor Class and damage roll can be tested.
 */
export function giveStartingKit(player: Entity): void {
  player.inventory = [...onePerBase(HAND_WEAPONS, WEAPON_BASES), ...onePerBase(SHIELDS, ['shield']), ...onePerBase(ARMORS, ARMOR_BASES)];
}

/** One trip into the dungeon: how deep the party has gone. A new run starts from the title screen. */
type RunState = {
  depth: number;
  /** Alone, one death or fall ends the run; the scene sets this when the level starts. */
  hardcore: boolean;
  /** The run is lost: dying or falling ended it, and the game over screen is up. */
  over: boolean;
  /** Seed of the next level, picked (and its map generated) as soon as the exit is pulled. */
  nextSeed: number | null;
};

export const run: RunState = { depth: 1, hardcore: false, over: false, nextSeed: null };

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
  run.nextSeed = null;
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

/**
 * Gives a freshly made player what they earned on the levels before; at the start of a run, when there is
 * nothing to carry, they get the starting kit instead.
 */
export function restorePlayer(player: Entity): void {
  const carry = carried.get(seatOf(player));
  if (!carry || !player.playerStats || !player.health) {
    giveStartingKit(player);
    return;
  }
  Object.assign(player.playerStats, structuredClone(carry.stats), { sprinting: false, sprint: 0, sprintLocked: false });
  player.inventory = structuredClone(carry.inventory);
  player.equipped = structuredClone(carry.equipped);
  player.health.max = carry.maxHealth;
  player.health.current = carry.maxHealth;
}
