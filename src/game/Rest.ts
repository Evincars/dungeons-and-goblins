import { world, q, localPlayer } from '../world';
import type { Entity, Player, PlayerSlot, RestKind, RestNotice } from '../world';
import type { Level } from '../level/Level';
import type { GuestCommand } from '../network/protocol';
import { coop } from '../network/CoopSession';
import { characterSheet } from '../rules/CharacterSheet';
import { hitDiceRegained, hitDieHealing } from '../rules/HitPoints';
import { rollDie } from '../rules/Dice';
import { logHeal, logLine } from '../systems/RollLogSystem';
import { playEffect } from '../assets/Effects';
import { AIM_HEIGHT } from '../entities/ProjectileFactory';
import { sound } from '../audio/SoundPlayer';
import { text } from '../core/texts';
import type { TextId } from '../core/texts';

/**
 * Resting, as in the tabletop game. A short rest (no enemy hunting the party, two before a long one is
 * needed) recovers every spell; a long rest (everyone in the safe room) also heals all wounds and gives back
 * half the hero's hit dice. Hit dice are spent one at a time to heal while no enemy is hunting you. In co-op
 * a rest one player asks for waits until every other player agrees; the host decides, and the party's
 * rest state (one entity, sent to guests) carries the vote and the notice shown over everyone's screen.
 */

/** Short rests a party may take before it needs a long one (the tabletop game's usual two a day). */
export const SHORT_RESTS_PER_LONG_REST = 2;
/** Ticks the others have to answer a rest asked for in co-op (20 s). */
export const REST_VOTE_TICKS = 1200;
/** Ticks a notice about a rest stays on screen (4 s). */
export const REST_NOTICE_TICKS = 240;
/** Rest commands waiting for the next tick, at most this many (a flood from one guest is cut off). */
const MAX_QUEUED = 16;
/** The healing glow over a hero who spends a hit die or wakes from a long rest. */
const HEAL_EFFECT = 'sparkle_ring';
const HEAL_COLOUR = 'green';
const HEAL_SCALE = 0.8;

export type RestCommand = Extract<GuestCommand, { kind: 'rest' | 'rest_answer' }>;
type RestState = NonNullable<Entity['restState']>;

const rests = world.with('restState');
const queued: Array<{ slot: PlayerSlot; command: RestCommand }> = [];

/** The seat a player sits in (a lone game's hero is the host's). */
export const seatOf = (player: Entity): PlayerSlot => player.playerSlot ?? 'host';

const nameOf = (player: Player): string => player.playerName || text('combat_log.default_hero');

/** The party's rest state as this screen sees it (its own, or the copy a guest was sent), once anyone has asked to rest. */
export function currentRest(): Entity['restState'] {
  for (const entity of rests) return entity.restState;
  return undefined;
}

/** The level's rest state, made the first time anyone asks to rest. */
function theRest(): RestState {
  for (const entity of rests) return entity.restState;
  const fresh: RestState = { shortRestsLeft: SHORT_RESTS_PER_LONG_REST, vote: null, notice: null };
  return world.add({ restState: fresh }).restState ?? fresh;
}

function notify(state: RestState, notice: RestNotice, name: string, kind: RestKind): void {
  state.notice = { notice, name, kind, age: 0 };
}

/** Whether any living enemy is hunting the party (alert to it, fighting it or tracking it). */
export function enemiesHunting(): boolean {
  for (const mob of q.mobs) if (mob.health.current > 0 && mob.ai.state !== 'idle') return true;
  return false;
}

// ── Hit dice ──────────────────────────────────────────────────────────────────

/** Why a hit die can't be spent now, said over the hero's head; null when it can. */
function hitDieRefusal(player: Player): TextId | null {
  if (player.playerStats.hitDice <= 0) return 'roll.no_hit_dice';
  if (player.health.current >= player.health.max) return 'roll.full_health';
  return enemiesHunting() ? 'roll.hunted' : null;
}

/** Spends one hit die: the die + CON modifier (at the game's hit point scale) is healed. Returns whether it was spent. */
export function spendHitDie(player: Player): boolean {
  if (player.health.current <= 0 || player.respawnTicks !== undefined) return false;
  const refusal = hitDieRefusal(player);
  const { x, y } = player.position;
  if (refusal) {
    logLine(player, text(refusal), 'miss');
    sound.playSound('fail', x, y);
    return false;
  }
  const sheet = characterSheet(player);
  const healing = hitDieHealing(rollDie(sheet.heroClass.hitDie), sheet.modifiers.constitution);
  const healed = Math.min(player.health.max - player.health.current, healing);
  player.playerStats.hitDice--;
  player.health.current += healed;
  logHeal(player, healed);
  playEffect(HEAL_EFFECT, HEAL_COLOUR, x, y, AIM_HEIGHT, HEAL_SCALE);
  sound.playSound('gem', x, y);
  return true;
}

/** Clicking the hit dice on the sheet: spent at once here, or asked of the host for a guest. */
export function requestHitDie(player: Player): void {
  if (coop.role === 'guest') coop.sendCommand({ kind: 'hit_die' });
  else spendHitDie(player);
}

// ── Asking and answering ──────────────────────────────────────────────────────

/** Host: a rest command from a seat, carried out on the next tick (which knows the level). */
export function queueRestCommand(slot: PlayerSlot, command: RestCommand): void {
  if (queued.length < MAX_QUEUED) queued.push({ slot, command });
}

function sendOrQueue(command: RestCommand): void {
  if (coop.role === 'guest') {
    coop.sendCommand(command);
    return;
  }
  const me = localPlayer();
  if (me) queueRestCommand(seatOf(me), command);
}

/** The rest menu: this screen's player asks the party for a rest. */
export function requestRest(kind: RestKind): void {
  sendOrQueue({ kind: 'rest', rest: kind });
}

/** The rest prompt: this screen's player agrees to the rest asked for, or turns it down. */
export function answerRest(agree: boolean): void {
  sendOrQueue({ kind: 'rest_answer', agree });
}

function playerAt(slot: PlayerSlot): Player | undefined {
  for (const player of q.players) if (seatOf(player) === slot) return player;
  return undefined;
}

/** Why the party can't take this rest now; null when it can. */
function restBlocked(kind: RestKind, level: Level, state: RestState): RestNotice | null {
  for (const player of q.players) if (player.health.current <= 0 || player.respawnTicks !== undefined) return 'fallen';
  if (kind === 'long') return everyoneSafe(level) ? null : 'unsafe';
  if (state.shortRestsLeft <= 0) return 'no_short_left';
  return enemiesHunting() ? 'hunted' : null;
}

function everyoneSafe(level: Level): boolean {
  for (const player of q.players) if (!level.isWorldPosSafe(player.position.x, player.position.y)) return false;
  return true;
}

/** A player asks for a rest: refused with the reason, taken at once alone, or put to the others in co-op. */
function ask(player: Player, kind: RestKind, level: Level, state: RestState): void {
  if (state.vote) return;
  const blocked = restBlocked(kind, level, state);
  if (blocked) {
    notify(state, blocked, nameOf(player), kind);
    return;
  }
  if (q.players.entities.length <= 1) {
    takeRest(kind, state);
    return;
  }
  const seat = seatOf(player);
  state.vote = { kind, by: seat, agreed: [seat], ticks: REST_VOTE_TICKS };
  notify(state, 'asked', nameOf(player), kind);
}

/** A player answers the rest asked for: one refusal calls it off. */
function answer(player: Player, agree: boolean, state: RestState): void {
  const vote = state.vote;
  const seat = seatOf(player);
  if (!vote || vote.agreed.includes(seat)) return;
  if (agree) {
    vote.agreed.push(seat);
    return;
  }
  state.vote = null;
  notify(state, 'declined', nameOf(player), vote.kind);
}

// ── Resting ───────────────────────────────────────────────────────────────────

/** A long rest: every wound healed and half the hero's hit dice (at least one) back. */
function wake(player: Player): void {
  const stats = player.playerStats;
  player.health.current = player.health.max;
  stats.hitDice = Math.min(stats.level, stats.hitDice + hitDiceRegained(stats.level));
  playEffect(HEAL_EFFECT, HEAL_COLOUR, player.position.x, player.position.y, AIM_HEIGHT, HEAL_SCALE);
}

/** The party rests: every spell recovered, and after a long rest everyone healed. */
export function takeRest(kind: RestKind, state: RestState = theRest()): void {
  for (const player of q.players) {
    player.spellbook?.recovery.fill(0);
    if (kind === 'long') wake(player);
  }
  state.shortRestsLeft = kind === 'long' ? SHORT_RESTS_PER_LONG_REST : state.shortRestsLeft - 1;
  notify(state, kind === 'long' ? 'long_done' : 'short_done', '', kind);
  sound.playSound('buy');
}

/** Whether every player in the game has agreed to the vote. */
function everyoneAgreed(agreed: readonly PlayerSlot[]): boolean {
  for (const player of q.players) if (!agreed.includes(seatOf(player))) return false;
  return true;
}

/** The vote ends: the rest is taken (if it still can be) once all agree; nobody answering calls it off. */
function tickVote(level: Level, state: RestState): void {
  const vote = state.vote;
  if (!vote) return;
  if (everyoneAgreed(vote.agreed)) {
    state.vote = null;
    const blocked = restBlocked(vote.kind, level, state);
    if (blocked) notify(state, blocked, '', vote.kind);
    else takeRest(vote.kind, state);
    return;
  }
  if (--vote.ticks <= 0) {
    state.vote = null;
    notify(state, 'timeout', '', vote.kind);
  }
}

/** Host, each tick: the rest commands that came in, the vote, and the notice fading. */
export function updateRest(level: Level): void {
  if (!queued.length && !currentRest()) return;
  const state = theRest();
  for (const { slot, command } of queued) {
    const player = playerAt(slot);
    if (!player) continue;
    if (command.kind === 'rest') ask(player, command.rest, level, state);
    else answer(player, command.agree, state);
  }
  queued.length = 0;
  tickVote(level, state);
  if (state.notice && ++state.notice.age > REST_NOTICE_TICKS) state.notice = null;
}
