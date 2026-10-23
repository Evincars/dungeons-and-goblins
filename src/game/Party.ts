import { world, q, localPlayer } from '../world';
import type { Entity, Player, PartyVote, PlayerSlot, RestNotice, VoteKind } from '../world';
import { coop } from '../network/CoopSession';
import { text } from '../core/texts';

/**
 * What the party decides together in co-op: a rest, or opening the safe room's gate. One player asks, every
 * other player agrees or refuses (one refusal, or nobody answering in time, calls it off); the module that
 * asked carries it out once everyone has agreed. The party's state — the vote, short rests left and the
 * notice shown over every screen — is one entity the host keeps and sends to the guests.
 */

/** Short rests a party may take before it needs a long one (the tabletop game's usual two a day). */
export const SHORT_RESTS_PER_LONG_REST = 2;
/** Ticks the others have to answer a vote (20 s). */
export const VOTE_TICKS = 1200;
/** Ticks a notice stays on screen (4 s). */
export const NOTICE_TICKS = 240;
/** Answers waiting for the next tick, at most this many (a flood from one guest is cut off). */
const MAX_QUEUED = 16;

export type PartyState = NonNullable<Entity['party']>;

const parties = world.with('party');
const answers: Array<{ slot: PlayerSlot; agree: boolean }> = [];

/** The seat a player sits in (a lone game's hero is the host's). */
export const seatOf = (player: Entity): PlayerSlot => player.playerSlot ?? 'host';

export const nameOf = (player: Player): string => player.playerName || text('combat_log.default_hero');

/** The party's state as this screen sees it (its own, or the copy a guest was sent), once anything was asked. */
export function currentParty(): Entity['party'] {
  for (const entity of parties) return entity.party;
  return undefined;
}

/** The level's party state, made the first time anything is asked. */
export function partyState(): PartyState {
  for (const entity of parties) return entity.party;
  const fresh: PartyState = { shortRestsLeft: SHORT_RESTS_PER_LONG_REST, vote: null, notice: null };
  return world.add({ party: fresh }).party ?? fresh;
}

export function notify(state: PartyState, notice: RestNotice, name: string, kind: VoteKind): void {
  state.notice = { notice, name, kind, age: 0 };
}

/** Whether there is nobody to ask: a lone game, or the host's companions all gone. */
export function isAlone(): boolean {
  return q.players.entities.length <= 1;
}

/** Puts a question to the party, the asker agreeing; false while another vote is open (one at a time). */
export function openVote(player: Player, kind: VoteKind, state: PartyState = partyState()): boolean {
  if (state.vote) return false;
  const seat = seatOf(player);
  state.vote = { kind, by: seat, agreed: [seat], ticks: VOTE_TICKS };
  notify(state, 'asked', nameOf(player), kind);
  return true;
}

/** Host: an answer from a seat, counted on the next tick. */
export function queueAnswer(slot: PlayerSlot, agree: boolean): void {
  if (answers.length < MAX_QUEUED) answers.push({ slot, agree });
}

/** The prompt's Agree / Refuse: this screen's player answers, through the host for a guest. */
export function answerVote(agree: boolean): void {
  if (coop.role === 'guest') {
    coop.sendCommand({ kind: 'vote_answer', agree });
    return;
  }
  const me = localPlayer();
  if (me) queueAnswer(seatOf(me), agree);
}

function playerAt(slot: PlayerSlot): Player | undefined {
  for (const player of q.players) if (seatOf(player) === slot) return player;
  return undefined;
}

/** A player answers the vote: one refusal calls it off. */
function answer(player: Player, agree: boolean, state: PartyState): void {
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

/** Whether every player in the game has agreed. */
function everyoneAgreed(agreed: readonly PlayerSlot[]): boolean {
  for (const player of q.players) if (!agreed.includes(seatOf(player))) return false;
  return true;
}

/** The open vote, if it is about one of `kinds` and everyone has agreed: closed, and handed to the caller to carry out. */
export function takeAgreedVote(kinds: readonly VoteKind[]): PartyVote | null {
  const state = currentParty();
  const vote = state?.vote;
  if (!state || !vote || !kinds.includes(vote.kind) || !everyoneAgreed(vote.agreed)) return null;
  state.vote = null;
  // The question is answered: what comes of it says so itself.
  if (state.notice?.notice === 'asked') state.notice = null;
  return vote;
}

/** Host, each tick before the votes are acted on: the answers that came in, time running out, the notice fading. */
export function updateParty(): void {
  const state = currentParty();
  if (!state) {
    answers.length = 0;
    return;
  }
  for (const { slot, agree } of answers) {
    const player = playerAt(slot);
    if (player) answer(player, agree, state);
  }
  answers.length = 0;
  const vote = state.vote;
  if (vote && !everyoneAgreed(vote.agreed) && --vote.ticks <= 0) {
    state.vote = null;
    notify(state, 'timeout', '', vote.kind);
  }
  if (state.notice && ++state.notice.age > NOTICE_TICKS) state.notice = null;
}
