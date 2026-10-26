import { q, localPlayer, REST_KINDS, isRestKind } from '../world';
import type { Player, PlayerSlot, RestKind, RestNotice } from '../world';
import type { Level } from '../level/Level';
import { coop } from '../network/CoopSession';
import { currentParty, isAlone, nameOf, notify, openVote, partyState, seatOf, SHORT_RESTS_PER_LONG_REST, takeAgreedVote } from './Party';
import type { PartyState } from './Party';
import { characterSheet } from '../rules/CharacterSheet';
import { hitDiceRegained, hitDieHealing } from '../rules/HitPoints';
import { rollDie } from '../rules/Dice';
import { logHeal, logLine } from '../systems/RollLogSystem';
import { playEffect } from '../assets/Effects';
import { AIM_HEIGHT } from '../entities/ProjectileFactory';
import { sound } from '../audio/SoundPlayer';
import { text } from '../core/texts';
import type { TextId } from '../core/texts';
import { isStanding } from './Fallen';

/**
 * Resting, as in the tabletop game. A short rest (no enemy hunting the party, two before a long one is
 * needed) recovers every spell, and in it each hero may spend hit dice to heal — as many of those they have
 * left as they choose, each the class's die + CON. A long rest (everyone in the safe room) heals all wounds and
 * gives back half the hero's hit dice. Wounds heal no other way (besides spells). In co-op a rest one player
 * asks for is put to the party (game/Party.ts) and taken once everyone agrees; the asker says how many hit dice
 * they will spend as they ask, the others once it is taken.
 */

export { SHORT_RESTS_PER_LONG_REST };
/** Rest requests waiting for the next tick, at most this many (a flood from one guest is cut off). */
const MAX_QUEUED = 16;
/** The healing glow over a hero who spends a hit die or wakes from a long rest. */
const HEAL_EFFECT = 'sparkle_ring';
const HEAL_COLOUR = 'green';
const HEAL_SCALE = 0.8;

const requests: Array<{ slot: PlayerSlot; kind: RestKind; dice?: number }> = [];
/** How many hit dice the player who asked for the short rest under vote will spend in it, by seat. */
const chosenDice = new Map<PlayerSlot, number>();

/** Whether any living enemy is hunting the party (alert to it, fighting it or tracking it). */
export function enemiesHunting(): boolean {
  for (const mob of q.mobs) if (mob.health.current > 0 && mob.ai.state !== 'idle') return true;
  return false;
}

// ── Hit dice ──────────────────────────────────────────────────────────────────

/** Rolls `count` of the hero's hit dice: each the class's die + CON (at the game's hit point scale). */
function rollHitDice(player: Player, count: number): number {
  const sheet = characterSheet(player);
  let healing = 0;
  for (let i = 0; i < count; i++) healing += hitDieHealing(rollDie(sheet.heroClass.hitDie), sheet.modifiers.constitution);
  return healing;
}

/**
 * In the short rest just taken, the hero spends `count` hit dice (no more than they have; 0: none) and heals what
 * they roll, shown over their head. Once a rest: the choice is then made. Returns how many were spent.
 */
export function spendHitDice(player: Player, count: number): number {
  const stats = player.playerStats;
  if (!stats.restDiceOpen) return 0;
  stats.restDiceOpen = false;
  const dice = Math.min(Math.max(0, Math.floor(count)), stats.hitDice);
  if (dice === 0 || player.health.current <= 0) return 0;
  const healed = Math.min(player.health.max - player.health.current, rollHitDice(player, dice));
  stats.hitDice -= dice;
  player.health.current += healed;
  logLine(player, text('roll.hit_dice', { dice: `${dice}d${characterSheet(player).heroClass.hitDie}` }), 'hit');
  logHeal(player, healed);
  const { x, y } = player.position;
  playEffect(HEAL_EFFECT, HEAL_COLOUR, x, y, AIM_HEIGHT, HEAL_SCALE);
  sound.playSound('drink', x, y);
  return dice;
}

/** The short rest's choice of hit dice: made at once here, or sent to the host for a guest. */
export function requestRestDice(player: Player, count: number): void {
  if (coop.role === 'guest') coop.sendCommand({ kind: 'rest_dice', count });
  else spendHitDice(player, count);
}

// ── Asking ────────────────────────────────────────────────────────────────────

/** Host: a seat asks for a rest (a short one with the hit dice they will spend), looked at on the next tick (which knows the level). */
export function queueRestRequest(slot: PlayerSlot, kind: RestKind, dice?: number): void {
  if (requests.length < MAX_QUEUED) requests.push({ slot, kind, dice });
}

/** The rest menu: this screen's player asks the party for a rest — a short one spending `dice` hit dice. */
export function requestRest(kind: RestKind, dice?: number): void {
  if (coop.role === 'guest') {
    coop.sendCommand({ kind: 'rest', rest: kind, dice });
    return;
  }
  const me = localPlayer();
  if (me) queueRestRequest(seatOf(me), kind, dice);
}

function playerAt(slot: PlayerSlot): Player | undefined {
  for (const player of q.players) if (seatOf(player) === slot) return player;
  return undefined;
}

/** Why the party can't take this rest now; null when it can. */
function restBlocked(kind: RestKind, level: Level, state: PartyState): RestNotice | null {
  if (kind === 'long') return everyoneSafe(level) ? null : 'unsafe';
  if (state.shortRestsLeft <= 0) return 'no_short_left';
  return enemiesHunting() ? 'hunted' : null;
}

/** Whether every hero on their feet is in a safe room (the fallen lie where they fell, and rest no more). */
function everyoneSafe(level: Level): boolean {
  for (const player of q.players) if (isStanding(player) && !level.isWorldPosSafe(player.position.x, player.position.y)) return false;
  return true;
}

/** A player asks for a rest: refused with the reason, taken at once alone, or put to the others in co-op. */
function ask(player: Player, kind: RestKind, level: Level, state: PartyState, dice: number | undefined): void {
  if (state.vote || !isStanding(player)) return;
  const blocked = restBlocked(kind, level, state);
  if (blocked) {
    notify(state, blocked, nameOf(player), kind);
    return;
  }
  chosenDice.clear();
  if (dice !== undefined) chosenDice.set(seatOf(player), dice);
  if (isAlone()) takeRest(kind, state);
  else openVote(player, kind, state);
}

// ── Resting ───────────────────────────────────────────────────────────────────

/** A long rest: every wound healed and half the hero's hit dice (at least one) back. */
function wake(player: Player): void {
  const stats = player.playerStats;
  stats.restDiceOpen = false;
  player.health.current = player.health.max;
  stats.hitDice = Math.min(stats.level, stats.hitDice + hitDiceRegained(stats.level));
  playEffect(HEAL_EFFECT, HEAL_COLOUR, player.position.x, player.position.y, AIM_HEIGHT, HEAL_SCALE);
}

/**
 * A short rest's hit dice: the hero who asked for it spends what they chose; everyone else with dice left is asked
 * now, on their own screen.
 */
function offerHitDice(player: Player): void {
  player.playerStats.restDiceOpen = player.playerStats.hitDice > 0;
  const chosen = chosenDice.get(seatOf(player));
  if (chosen !== undefined) spendHitDice(player, chosen);
}

/**
 * The party rests: every spell recovered; after a short rest hit dice to spend, after a long one everyone healed. A
 * fallen hero stays down: no rest brings them back (game/Fallen.ts).
 */
export function takeRest(kind: RestKind, state: PartyState = partyState()): void {
  for (const player of q.players) {
    if (!isStanding(player)) continue;
    player.spellbook?.recovery.fill(0);
    if (kind === 'long') wake(player);
    else offerHitDice(player);
  }
  chosenDice.clear();
  state.shortRestsLeft = kind === 'long' ? SHORT_RESTS_PER_LONG_REST : state.shortRestsLeft - 1;
  notify(state, kind === 'long' ? 'long_done' : 'short_done', '', kind);
  sound.playSound('rest');
}

/** Host, each tick (after the party's answers): rests asked for, and a rest everyone agreed to (if it still can be taken). */
export function updateRest(level: Level): void {
  if (!requests.length && !currentParty()) return;
  const state = partyState();
  for (const { slot, kind, dice } of requests) {
    const player = playerAt(slot);
    if (player) ask(player, kind, level, state, dice);
  }
  requests.length = 0;
  const agreed = takeAgreedVote(REST_KINDS);
  if (!agreed || !isRestKind(agreed.kind)) return;
  const blocked = restBlocked(agreed.kind, level, state);
  if (blocked) notify(state, blocked, '', agreed.kind);
  else takeRest(agreed.kind, state);
}
