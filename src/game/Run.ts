import { q } from '../world';
import type { LevelTheme } from '../level/Theme';
import { LEVEL_THEMES } from '../level/Theme';
import type { Entity, InventoryItem, Player } from '../world';
import { ARMORS, HAND_WEAPONS, SHIELDS, consumable, freshCopy } from '../entities/ItemCatalog';
import { WEAPON_BASES } from '../rules/WeaponTable';
import { ARMOR_BASES } from '../rules/ArmorTable';
import type { ItemBase } from '../rules/Equipment';
import type { Build } from '../rules/Build';
import { heroClass, itemTrained } from '../rules/Classes';
import { LOAD_EASY, MAX_CARRY_KG } from '../rules/Encumbrance';

/** A fresh copy (freshCopy) of the first catalogue entry of each of these D&D bases (in that order), skipping any the catalogue lacks. */
function onePerBase(from: readonly InventoryItem[], bases: readonly ItemBase[]): InventoryItem[] {
  return bases.flatMap((base) => {
    const item = from.find((entry) => entry.base === base);
    return item ? [freshCopy(item)] : [];
  });
}

/** How many flasks of Alchemist's Fire every hero sets out with. */
const STARTING_FLASKS = 2;

/**
 * What a hero sets out with: two flasks of Alchemist's Fire, then one of each kind of weapon, shield and armour they are
 * trained in (a wizard's dagger, quarterstaff, light crossbow… and robe; a fighter's martial arms and every armour), in that
 * order, as long as the load stays light enough not to slow them (rules/Encumbrance.ts); the rest the trader sells.
 */
export function giveStartingKit(player: Entity): void {
  const cls = heroClass(player.heroClass);
  const trained = [...onePerBase(HAND_WEAPONS, WEAPON_BASES), ...onePerBase(SHIELDS, ARMOR_BASES), ...onePerBase(ARMORS, ARMOR_BASES)]
    .filter((item) => itemTrained(cls, item));
  // Two flasks of Alchemist's Fire to throw, at the top of the bag.
  const kit: InventoryItem[] = Array.from({ length: STARTING_FLASKS }, () => consumable('alchemists_fire'));
  let kg = kit.reduce((sum, item) => sum + (item.weight ?? 0), 0);
  for (const item of trained) {
    const weight = item.weight ?? 0;
    if (kg + weight > MAX_CARRY_KG * LOAD_EASY) continue;
    kit.push(item);
    kg += weight;
  }
  player.inventory = kit;
}

/** One trip into the dungeon: how deep the party has gone. A new run starts from the title screen. */
type RunState = {
  depth: number;
  /** The run is lost: the whole party is down (alone, the first death or fall), and the game over screen is up. */
  over: boolean;
  /** Seed of the next level, picked (and its map generated) as soon as the exit is pulled. */
  nextSeed: number | null;
  /** What the levels are built as (catacombs, a castle or the isometric castle: the console's /dungeon switches it for testing). */
  theme: LevelTheme;
};

export const run: RunState = { depth: 1, over: false, nextSeed: null, theme: 'catacomb' };

/**
 * What a player takes down to the next level: their progress, gear and wounds (they heal by resting), not their
 * position.
 */
type Carry = {
  stats: NonNullable<Entity['playerStats']>;
  inventory: NonNullable<Entity['inventory']>;
  equipped: NonNullable<Entity['equipped']>;
  maxHealth: number;
  health: number;
  build: Build | undefined;
  /**
   * The player's own choices about their hero, which stay theirs from level to level: what they bound to the quick bar,
   * the class features they switched off and the toggle feats they switched on.
   */
  bound: NonNullable<Entity['spellbook']>['bound'];
  featuresOff: string[] | undefined;
  featsOn: string[] | undefined;
};

/** Progress of the players in the run so far, by seat. */
const carried = new Map<string, Carry>();

const seatOf = (player: Entity): string => player.playerSlot ?? 'host';

export function startRun(): void {
  run.depth = 1;
  run.over = false;
  run.nextSeed = null;
  run.theme = 'catacomb';
  carried.clear();
}

/**
 * A saved game is taken up (game/SaveGame.ts): the run stands at the save's depth, in its kind of dungeon, on the level
 * of its seed. The heroes' progress lives on in the saved world, not in what is carried.
 */
export function resumeRun(depth: number, theme: LevelTheme, seed: number): void {
  startRun();
  run.depth = depth;
  run.theme = theme;
  run.nextSeed = seed;
}

/**
 * The console's /dungeon: this level is built again as `theme` (and the levels after it), at the same depth; every
 * hero keeps what they have, as they would going deeper.
 */
export function rebuildLevelAs(theme: LevelTheme): void {
  for (const player of q.players) carried.set(seatOf(player), player.health.current > 0 ? carryOf(player) : revivedCarry(player));
  run.theme = theme;
  run.nextSeed = null;
}

/** What a hero still on their feet takes deeper: everything, wounds included. */
function carryOf(player: Player): Carry {
  return {
    stats: structuredClone(player.playerStats),
    inventory: structuredClone(player.inventory ?? []),
    equipped: structuredClone(player.equipped ?? {}),
    maxHealth: player.health.max,
    health: player.health.current,
    build: structuredClone(player.build),
    bound: structuredClone(player.spellbook?.bound),
    featuresOff: structuredClone(player.featuresOff),
    featsOn: structuredClone(player.featsOn),
  };
}

/**
 * A fallen hero comes back for the next level (game/Fallen.ts): whole again, with their experience, levels and build,
 * but without gear or gold — what they had was left where they fell.
 */
function revivedCarry(player: Player): Carry {
  return { ...carryOf(player), stats: { ...structuredClone(player.playerStats), gold: 0 }, inventory: [], equipped: {}, health: player.health.max };
}

/** The heroes' level carried into the next level (their mean, rounded; 1 at the start of a run). */
export function carriedPartyLevel(): number {
  if (carried.size === 0) return 1;
  let sum = 0;
  for (const carry of carried.values()) sum += carry.stats.level;
  return Math.max(1, Math.round(sum / carried.size));
}

/**
 * What the next level is built as: the run starts in the catacombs, and every level after the first is any kind of dungeon
 * at random (the catacombs, either castle, the mines).
 */
export function nextTheme(): LevelTheme {
  return LEVEL_THEMES[Math.floor(Math.random() * LEVEL_THEMES.length)];
}

/** The exit was taken: the next level lies one deeper, and everyone's progress comes along (the fallen come back). */
export function descend(): void {
  for (const player of q.players) carried.set(seatOf(player), player.health.current > 0 ? carryOf(player) : revivedCarry(player));
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
  if (carry.build) player.build = structuredClone(carry.build);
  restoreChoices(player, carry);
  player.health.current = Math.min(carry.health, carry.maxHealth);
}

/** The quick bar's bindings and the switched features and feats come back as the player left them. */
function restoreChoices(player: Entity, carry: Carry): void {
  if (carry.bound && player.spellbook) player.spellbook.bound = structuredClone(carry.bound);
  if (carry.featuresOff) player.featuresOff = structuredClone(carry.featuresOff);
  if (carry.featsOn) player.featsOn = structuredClone(carry.featsOn);
}
