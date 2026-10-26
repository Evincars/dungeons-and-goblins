import { world } from '../world';
import type { Entity, InventoryItem } from '../world';
import { itemIcon } from './Items';
import type { SfxName } from '../audio/SoundPlayer';
import { dice, rollDice } from '../rules/Dice';
import { nearby, Sense } from '../ai/perception/spatial';
import type { Level } from '../level/Level';
import type { Dice } from '../rules/Dice';

/**
 * Coins and gems, ported from Catacomb Snatch Redux: its nine pickups, how a drop rolls which one it is,
 * and how fast each spins.
 */

/** Pull radius, a little wider than the original's reach. */
export const LOOT_PULL_RADIUS = 64;
/** Ticks a coin lies around: 600-699, as in the original. */
const LIFE_MIN = 600;
const LIFE_SPREAD = 100;
/** Ticks a dropped coin spends in the air, arcing out of whatever dropped it. */
export const LOOT_BURST_TICKS = 24;
/** Ticks each spin frame shows (Redux's pace). */
const SPIN_FRAME_TICKS = 3;
/** Pickups rest this far above their ground position. */
export const LOOT_REST_LIFT = 2;
/** Coins and gems are drawn at this size (Redux's art is large next to this game's characters). */
const LOOT_SCALE = 0.7;

type LootKind = { sheet: string; frames: number; value: number; sound: SfxName };

/** The original's nine pickups, from the smallest coin to the diamond. */
export const LOOT_KINDS: readonly LootKind[] = [
  { sheet: 'pickup_coin_bronze_small_8', frames: 6, value: 1, sound: 'coin' },
  { sheet: 'pickup_coin_silver_small_8', frames: 7, value: 2, sound: 'coin' },
  { sheet: 'pickup_coin_gold_small_8', frames: 7, value: 5, sound: 'coin' },
  { sheet: 'pickup_coin_bronze_16', frames: 6, value: 10, sound: 'coin' },
  { sheet: 'pickup_coin_silver_16', frames: 7, value: 20, sound: 'coin' },
  { sheet: 'pickup_coin_gold_16', frames: 7, value: 50, sound: 'coin_big' },
  { sheet: 'pickup_gem_emerald_12', frames: 7, value: 100, sound: 'gem' },
  { sheet: 'pickup_gem_ruby_12', frames: 7, value: 200, sound: 'gem' },
  { sheet: 'pickup_gem_diamond_24', frames: 14, value: 500, sound: 'gem_big' },
];

/** The pickup sound for a kind of coin or gem. */
export function lootSound(kind: number): SfxName {
  return LOOT_KINDS[kind]?.sound ?? 'coin';
}

/** One step up a tier happens with this chance, twice: that is how a kill occasionally throws a gem. */
const TIER_UP_CHANCE = 1 / 3;

/** The original Loot constructor: the smallest pickup worth at least `value`, then maybe a tier or two up. */
function rollKind(value: number): number {
  let kind = 0;
  while (kind < LOOT_KINDS.length - 1 && LOOT_KINDS[kind].value < value) kind++;
  if (Math.random() < TIER_UP_CHANCE) kind++;
  if (Math.random() < TIER_UP_CHANCE) kind++;
  return Math.min(kind, LOOT_KINDS.length - 1);
}

/** Largest pickup not worth more than `value`, for coins that must keep their exact worth. */
function exactKind(value: number): number {
  let kind = 0;
  while (kind < LOOT_KINDS.length - 1 && LOOT_KINDS[kind + 1].value <= value) kind++;
  return kind;
}

/** A coin or gem flung out at (velX, velY); `exact` keeps the stated worth (spilled money) instead of rolling a tier. */
export function createLoot(x: number, y: number, velX: number, velY: number, value: number, exact = false): Entity {
  const kind = exact ? exactKind(value) : rollKind(value);
  return createLootOfKind(x, y, velX, velY, kind, exact ? value : LOOT_KINDS[kind].value);
}

/** A pickup of a given kind (index into LOOT_KINDS), worth `value`. */
function createLootOfKind(x: number, y: number, velX: number, velY: number, kind: number, value: number): Entity {
  const spec = LOOT_KINDS[kind];
  const pow = 1 + Math.random();
  return world.add({
    position: { x, y },
    yOffset: LOOT_REST_LIFT,
    loot: {
      value,
      kind,
      velX: velX * pow * 2,
      velY: velY * pow * 2,
      suckRadius: LOOT_PULL_RADIUS,
      glide: 0,
      age: 0,
      life: LIFE_MIN + Math.floor(Math.random() * LIFE_SPREAD),
      burstTicks: LOOT_BURST_TICKS,
    },
    radius: { x: 4, y: 4 },
    visual: { sheet: spec.sheet, scale: LOOT_SCALE },
    animation: {
      sheet: spec.sheet,
      frameX: Math.floor(Math.random() * spec.frames),
      frameY: 0,
      frameCount: spec.frames,
      frameTime: SPIN_FRAME_TICKS,
      timer: 0,
      loop: true,
    },
  });
}

/** What a kill pays its killer, straight into the purse (before their Charisma's share): not much, but not a few. */
const KILL_GOLD = dice(3, 20);

/** The gold a kill pays. */
export function killReward(): number {
  return rollDice(KILL_GOLD);
}

/**
 * What searching a barrel, crate, coffin or sack turns up, checked from the rarest: now and then a little hoard
 * (2d20), a purse (1d20), more often a few coins (1d6); whatever is left over holds nothing.
 */
const STASH_FINDS: ReadonlyArray<{ chance: number; coins: Dice }> = [
  { chance: 0.03, coins: dice(2, 20) },
  { chance: 0.07, coins: dice(1, 20) },
  { chance: 0.25, coins: dice(1, 6) },
];

/** The coins one openable prop holds (0: it is empty). */
export function stashCoins(): number {
  let roll = Math.random();
  for (const find of STASH_FINDS) {
    if (roll < find.chance) return rollDice(find.coins);
    roll -= find.chance;
  }
  return 0;
}

/** Most pieces a sum of money spills as. */
const MAX_SPILL_PIECES = 12;
/**
 * A fallen hero's purse lies where it spilled for this long (an hour) instead of blinking out with ordinary coins:
 * the others must be able to come back for it. A whole number, as everything sent to co-op guests must be.
 */
const KEPT_LOOT_LIFE = 60 * 60 * 60;

/**
 * A sum spilled as a handful of exact-valued pickups, halving as it goes (Redux's spillMoney); `kept` coins stay
 * until somebody picks them up.
 */
export function spillMoney(x: number, y: number, total: number, maxPieces = MAX_SPILL_PIECES, kept = false): void {
  let remaining = Math.floor(total);
  for (let i = 0; remaining > 0 && i < maxPieces; i++) {
    const value = i === maxPieces - 1 ? remaining : Math.max(1, Math.ceil(remaining / 2));
    const angle = Math.random() * Math.PI * 2;
    const coin = createLoot(x, y, Math.cos(angle), Math.sin(angle), value, true);
    if (kept && coin.loot) coin.loot.life = KEPT_LOOT_LIFE;
    remaining -= value;
  }
}

/** Things lying on the floor are drawn this big (their longer side), a little above the ground. */
const ITEM_FIT = 18;
const ITEM_LIFT = 8;
/**
 * Things set down in one place keep this far apart, so each can be seen and picked: on rings round the spot,
 * nearest first (127 spots on six rings). Past the last ring they pile up.
 */
const ITEM_SPACING = 12;
const ITEM_RINGS = 6;

/** Where the floor can hold something (the level's open ground, not its pits); anywhere, when there is no level to ask. */
export type Floor = Pick<Level, 'canHold'>;

/** The spots round a point, nearest first (worked out once): the point, then 6, 12, 18… on each ring out. */
function ringSpots(): Array<{ x: number; y: number }> {
  const spots = [{ x: 0, y: 0 }];
  for (let ring = 1; ring <= ITEM_RINGS; ring++) {
    const count = 6 * ring;
    // Every other ring is turned half a step, so the rings interleave.
    for (let k = 0; k < count; k++) {
      const angle = ((k + (ring % 2) / 2) / count) * Math.PI * 2;
      spots.push({ x: Math.cos(angle) * ring * ITEM_SPACING, y: Math.sin(angle) * ring * ITEM_SPACING });
    }
  }
  return spots;
}
const SPOTS = ringSpots();
const neighbours: Entity[] = [];
const spot = { x: 0, y: 0 };

/**
 * The nearest spot to (x, y), on the rings, where the floor holds things (in `out`): a hero who fell into a pit
 * leaves what they carried at its edge, not in it. The point itself when nothing near can hold anything.
 */
export function groundNear(x: number, y: number, floor: Floor, out: { x: number; y: number }): { x: number; y: number } {
  const offset = SPOTS.find((s) => floor.canHold(x + s.x, y + s.y));
  out.x = x + (offset?.x ?? 0);
  out.y = y + (offset?.y ?? 0);
  return out;
}

/** The nearest free spot to (x, y) on solid floor, with no other thing lying within ITEM_SPACING of it (in `spot`). */
function freeSpot(x: number, y: number, floor: Floor | undefined): { x: number; y: number } {
  for (const offset of SPOTS) {
    const sx = x + offset.x;
    const sy = y + offset.y;
    if (floor && !floor.canHold(sx, sy)) continue;
    if (nearby(sx, sy, ITEM_SPACING - 1, Sense.item, neighbours).length > 0) continue;
    spot.x = sx;
    spot.y = sy;
    return spot;
  }
  spot.x = x;
  spot.y = y;
  return spot;
}

/**
 * A weapon, shield or suit of armour lying on the floor (taken with E), at the free spot nearest (x, y): many set
 * down in one place spread round it instead of hiding one another.
 */
export function createItemPickup(x: number, y: number, item: InventoryItem, floor?: Floor): Entity {
  const at = freeSpot(x, y, floor);
  return world.add({
    position: { x: at.x, y: at.y },
    item: structuredClone(item),
    visual: { sheet: itemIcon(item), fit: ITEM_FIT },
    yOffset: ITEM_LIFT,
  });
}

/** Items heroes have put down (the inventory's Drop), waiting for the next tick to be laid where the floor has room. */
const toSetDown: Array<{ x: number; y: number; item: InventoryItem }> = [];

/** A hero puts an item down at (x, y): it is on the floor from the next tick. */
export function setDownItem(x: number, y: number, item: InventoryItem): void {
  toSetDown.push({ x, y, item });
}

/** Host, each tick: the items put down since the last are laid on the floor, off the walls. */
export function layDownItems(floor: Floor | undefined): void {
  for (const { x, y, item } of toSetDown) createItemPickup(x, y, item, floor);
  toSetDown.length = 0;
}

