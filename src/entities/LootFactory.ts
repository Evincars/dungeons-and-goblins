import { world } from '../world';
import type { Entity } from '../world';
import type { SfxName } from '../audio/SoundPlayer';

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
  const spec = LOOT_KINDS[kind];
  const pow = 1 + Math.random();
  return world.add({
    position: { x, y },
    yOffset: LOOT_REST_LIFT,
    loot: {
      value: exact ? value : spec.value,
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

/** A kill throws four pickups, each rolled from its worth, in a different pattern every time. */
const KILL_DROPS = 4;
const DROP_MIN_SPEED = 0.4;
const DROP_SPEED_SPREAD = 0.8;
export function dropLoot(x: number, y: number, value: number): void {
  for (let i = 0; i < KILL_DROPS; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = DROP_MIN_SPEED + Math.random() * DROP_SPEED_SPREAD;
    createLoot(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, value);
  }
}

/** Most pieces a sum of money spills as. */
const MAX_SPILL_PIECES = 12;
/** A sum spilled as a handful of exact-valued pickups, halving as it goes (Redux's spillMoney). */
export function spillMoney(x: number, y: number, total: number, maxPieces = MAX_SPILL_PIECES): void {
  let remaining = Math.floor(total);
  for (let i = 0; remaining > 0 && i < maxPieces; i++) {
    const value = i === maxPieces - 1 ? remaining : Math.max(1, Math.ceil(remaining / 2));
    const angle = Math.random() * Math.PI * 2;
    createLoot(x, y, Math.cos(angle), Math.sin(angle), value, true);
    remaining -= value;
  }
}
