import { world, q, localPlayer } from '../world';
import type { Entity, InventoryItem, LootChoice, Player, PlayerSlot } from '../world';
import { coop } from '../network/CoopSession';
import { rollDie } from '../rules/Dice';
import { createItemPickup } from '../entities/LootFactory';
import { logLine } from '../systems/RollLogSystem';
import { recordLoot } from '../systems/CombatLogSystem';
import { sound } from '../audio/SoundPlayer';
import { text } from '../core/texts';
import { isAlone, seatOf } from './Party';
import { addToBag } from './PlayerActions';

/**
 * Need or Pass, for a rare find in co-op. When a chest or a kill gives up a rare item (a +2 or better), it is
 * offered to the whole party at the bottom of every screen for 30 seconds. Everyone who picks Need rolls a
 * d20 (no modifier); the highest wins it, a tie is rolled again between those tied. Pass, or no answer in
 * time, stays out of it; if nobody needs it, it is gone. Alone, a find simply lands on the floor.
 */

/** Magic this strong or better makes a find rare (the tabletop game: a +2 weapon is rare, +3 very rare). */
export const RARE_BONUS = 2;
/** Ticks the party has to choose (30 s). */
export const LOOT_ROLL_TICKS = 1800;
/** Choices waiting for the next tick, at most this many (a flood from one guest is cut off). */
const MAX_QUEUED = 16;
/** A tie is rolled again at most this many times (then the first of those tied takes it). */
const MAX_TIE_ROLLS = 20;
const D20 = 20;

type LootRoll = NonNullable<Entity['lootRoll']>;

const rolls = world.with('lootRoll');
const choices: Array<{ slot: PlayerSlot; roll: number; need: boolean }> = [];
let nextRollId = 1;

export function isRare(item: InventoryItem): boolean {
  return (item.bonus ?? 0) >= RARE_BONUS;
}

/** A find from a chest or a kill: a rare one in co-op goes to the party's roll; returns false when it is not (it lands on the floor). */
export function offerLoot(item: InventoryItem): boolean {
  if (!isRare(item) || isAlone()) return false;
  world.add({ lootRoll: { id: nextRollId++, item: structuredClone(item), ticks: LOOT_ROLL_TICKS, choices: {} } });
  sound.playSound('gem_big');
  return true;
}

/** Host: a seat's Need or Pass, counted on the next tick. */
export function chooseLoot(slot: PlayerSlot, roll: number, need: boolean): void {
  if (choices.length < MAX_QUEUED) choices.push({ slot, roll, need });
}

/** The panel's Need / Pass: this screen's player chooses, through the host for a guest. */
export function requestLootChoice(roll: number, need: boolean): void {
  if (coop.role === 'guest') {
    coop.sendCommand({ kind: 'loot', roll, need });
    return;
  }
  const me = localPlayer();
  if (me) chooseLoot(seatOf(me), roll, need);
}

function playerAt(slot: PlayerSlot): Player | undefined {
  for (const player of q.players) if (seatOf(player) === slot) return player;
  return undefined;
}

function rollById(id: number): LootRoll | undefined {
  for (const entity of rolls) if (entity.lootRoll.id === id && !entity.removed) return entity.lootRoll;
  return undefined;
}

/** Each choice that came in, for a roll still open, from a player in the game who hasn't chosen yet. */
function takeChoices(): void {
  for (const { slot, roll, need } of choices) {
    const open = rollById(roll);
    if (open && playerAt(slot) && !open.choices[slot]) open.choices[slot] = need ? 'need' : 'pass';
  }
  choices.length = 0;
}

/** The seats that picked Need, among the players still in the game. */
function needers(roll: LootRoll): Player[] {
  const out: Player[] = [];
  for (const player of q.players) if (roll.choices[seatOf(player)] === ('need' satisfies LootChoice)) out.push(player);
  return out;
}

/** Everyone who needs it rolls a d20 (shown and logged); ties roll again. Returns the winner. */
function rollOff(contenders: Player[], item: string): Player | undefined {
  let field = contenders;
  for (let round = 0; round < MAX_TIE_ROLLS && field.length > 1; round++) {
    let best = 0;
    const totals = field.map((player) => {
      const total = rollDie(D20);
      logLine(player, text('roll.need', { total }), 'hit');
      recordLoot(player, 'need', total, item);
      best = Math.max(best, total);
      return total;
    });
    field = field.filter((_, i) => totals[i] === best);
  }
  return field[0];
}

/** The find goes to its winner's bag (or at their feet when they can't carry it), said over their head and in the log. */
function award(winner: Player, item: InventoryItem): void {
  if (!addToBag(winner, structuredClone(item))) createItemPickup(winner.position.x, winner.position.y, item);
  logLine(winner, text('roll.won', { item: item.name }), 'crit');
  recordLoot(winner, 'won', 0, item.name);
  sound.playSound('pickup', winner.position.x, winner.position.y);
}

/** Whether every player in the game has chosen. */
function everyoneChose(roll: LootRoll): boolean {
  for (const player of q.players) if (!roll.choices[seatOf(player)]) return false;
  return true;
}

function settle(entity: Entity, roll: LootRoll): void {
  world.addComponent(entity, 'removed', true);
  const winner = rollOff(needers(roll), roll.item.name);
  if (winner) award(winner, roll.item);
}

/** Host, each tick: the choices that came in; a roll everyone has answered, or whose time is up, is settled. */
export function updateLootRolls(): void {
  takeChoices();
  for (const entity of rolls) {
    const roll = entity.lootRoll;
    if (entity.removed) continue;
    roll.ticks--;
    if (roll.ticks <= 0 || everyoneChose(roll)) settle(entity, roll);
  }
}
