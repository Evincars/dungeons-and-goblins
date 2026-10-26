import { world } from '../world';
import type { Entity, Player } from '../world';
import type { Level } from '../level/Level';
import { text } from '../core/texts';
import { setVisualFrame } from '../render/AnimatedVisual';
import { sound } from '../audio/SoundPlayer';
import { coop } from '../network/CoopSession';
import { currentParty, isAlone, openVote, takeAgreedVote } from '../game/Party';
import { playerUsing } from './TargetSystem';
import { closeExitDoor, unlockDoors } from './DoorSystem';
import { logLine } from './RollLogSystem';

/** The lever's frame once pulled down. */
const PULLED_FRAME = 1;
/** After a pull the lever rests this long (not counting a vote still open) before it can be pulled again: 3 s. */
const LEVER_REST_TICKS = 180;
const GATE_VOTE = ['gate'] as const;

type Lever = Entity & { lever: NonNullable<Entity['lever']>; position: NonNullable<Entity['position']> };

const levers = world.with('position', 'lever');

/** The lever goes down, and stays down. */
function pullDown(lever: Lever): void {
  lever.lever.pulled = true;
  // Kept in the visual too, so co-op guests (who mirror components) see the lever pulled.
  if (lever.visual) lever.visual.col = PULLED_FRAME;
  if (lever.visual && lever.sprite) setVisualFrame(lever.sprite, lever.visual.sheet, PULLED_FRAME, 0);
}

/** The lever goes down and the gate opens: the party has 10 seconds to leave the safe room (systems/DoorSystem.ts). */
function openGate(lever: Lever, level: Level): void {
  pullDown(lever);
  unlockDoors(level);
}

/**
 * The exit room's lever: one pull — nobody is asked — and its portcullis drops 5 seconds later, shutting the room
 * for good; whoever is outside then stays out. The exit button works whether it was pulled or not.
 */
function shutExit(lever: Lever): void {
  if (!playerUsing(lever)) return;
  pullDown(lever);
  closeExitDoor();
}

/** Why the lever won't move for this pull (said over it), or null when it does. */
function refusal(lever: Lever): string | null {
  const waiting = coop.role === 'host' ? coop.guestsStillLoading() : 0;
  if (waiting > 0) return text('lever.waiting', { count: waiting });
  if (currentParty()?.vote) return text('lever.vote_open');
  return lever.lever.rest > 0 ? text('lever.resting') : null;
}

/**
 * A pull: alone the gate opens at once; in co-op every other player is asked first (one pull at a time — the
 * lever rests after each, and nothing moves while a vote is open).
 */
function pull(lever: Lever, puller: Player, level: Level): void {
  const { x, y } = lever.position;
  const refused = refusal(lever);
  if (refused) {
    logLine(lever, refused, 'miss');
    sound.playSound('fail', x, y);
    return;
  }
  lever.lever.rest = LEVER_REST_TICKS;
  if (isAlone()) openGate(lever, level);
  else openVote(puller, 'gate');
}

/**
 * The safe room starts closed: a player pulling the lever by its door (E) opens the way into the dungeon. In
 * co-op the host holds it until every guest has the level loaded, and the others must agree to it. The exit room's
 * lever shuts that room instead.
 */
export function updateLevers(level: Level): void {
  const agreed = takeAgreedVote(GATE_VOTE);
  const voting = currentParty()?.vote?.kind === 'gate';
  for (const lever of levers) {
    if (lever.lever.pulled) continue;
    if (lever.lever.exit) {
      shutExit(lever);
      continue;
    }
    if (agreed) {
      openGate(lever, level);
      continue;
    }
    if (lever.lever.rest > 0 && !voting) lever.lever.rest--;
    const puller = playerUsing(lever);
    if (puller) pull(lever, puller, level);
  }
}
