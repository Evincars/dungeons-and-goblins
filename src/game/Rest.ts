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

/**
 * Resting, as in the tabletop game. A short rest (no enemy hunting the party, two before a long one is
 * needed) recovers every spell; a long rest (everyone in the safe room) also heals all wounds and gives back
 * half the hero's hit dice. Hit dice are spent one at a time to heal while no enemy is hunting you. In co-op
 * a rest one player asks for is put to the party (game/Party.ts) and taken once everyone agrees.
 */

export { SHORT_RESTS_PER_LONG_REST };
/** Rest requests waiting for the next tick, at most this many (a flood from one guest is cut off). */
const MAX_QUEUED = 16;
/** The healing glow over a hero who spends a hit die or wakes from a long rest. */
const HEAL_EFFECT = 'sparkle_ring';
const HEAL_COLOUR = 'green';
const HEAL_SCALE = 0.8;

const requests: Array<{ slot: PlayerSlot; kind: RestKind }> = [];

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

// ── Asking ────────────────────────────────────────────────────────────────────

/** Host: a seat asks for a rest, looked at on the next tick (which knows the level). */
export function queueRestRequest(slot: PlayerSlot, kind: RestKind): void {
  if (requests.length < MAX_QUEUED) requests.push({ slot, kind });
}

/** The rest menu: this screen's player asks the party for a rest. */
export function requestRest(kind: RestKind): void {
  if (coop.role === 'guest') {
    coop.sendCommand({ kind: 'rest', rest: kind });
    return;
  }
  const me = localPlayer();
  if (me) queueRestRequest(seatOf(me), kind);
}

function playerAt(slot: PlayerSlot): Player | undefined {
  for (const player of q.players) if (seatOf(player) === slot) return player;
  return undefined;
}

/** Why the party can't take this rest now; null when it can. */
function restBlocked(kind: RestKind, level: Level, state: PartyState): RestNotice | null {
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
function ask(player: Player, kind: RestKind, level: Level, state: PartyState): void {
  if (state.vote) return;
  const blocked = restBlocked(kind, level, state);
  if (blocked) notify(state, blocked, nameOf(player), kind);
  else if (isAlone()) takeRest(kind, state);
  else openVote(player, kind, state);
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
export function takeRest(kind: RestKind, state: PartyState = partyState()): void {
  for (const player of q.players) {
    player.spellbook?.recovery.fill(0);
    if (kind === 'long') wake(player);
  }
  state.shortRestsLeft = kind === 'long' ? SHORT_RESTS_PER_LONG_REST : state.shortRestsLeft - 1;
  notify(state, kind === 'long' ? 'long_done' : 'short_done', '', kind);
  sound.playSound('buy');
}

/** Host, each tick (after the party's answers): rests asked for, and a rest everyone agreed to (if it still can be taken). */
export function updateRest(level: Level): void {
  if (!requests.length && !currentParty()) return;
  const state = partyState();
  for (const { slot, kind } of requests) {
    const player = playerAt(slot);
    if (player) ask(player, kind, level, state);
  }
  requests.length = 0;
  const agreed = takeAgreedVote(REST_KINDS);
  if (!agreed || !isRestKind(agreed.kind)) return;
  const blocked = restBlocked(agreed.kind, level, state);
  if (blocked) notify(state, blocked, '', agreed.kind);
  else takeRest(agreed.kind, state);
}
