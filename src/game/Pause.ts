import { PLAYER_SLOTS } from '../world';
import type { PlayerSlot } from '../world';

/**
 * Pausing in co-op: the game stops for everyone while any player has the pause menu open, and goes on once the
 * last of them closes it (each player opens and closes only their own). The host keeps who has it open: its own
 * menu, and what each guest says as they open or close theirs; a guest who leaves lets go of theirs. Alone, the
 * scene stops the game itself.
 */

const pausedSeats = new Set<PlayerSlot>();

/** Host: a seat opened or closed its pause menu. */
export function setSeatPaused(slot: PlayerSlot, paused: boolean): void {
  if (paused) pausedSeats.add(slot);
  else pausedSeats.delete(slot);
}

/** Whether anyone has the game paused. */
export function isGamePaused(): boolean {
  return pausedSeats.size > 0;
}

/** Who paused the game (the first seat with the menu open, the host first), or null when nobody has. */
export function pausingSeat(): PlayerSlot | null {
  for (const slot of PLAYER_SLOTS) if (pausedSeats.has(slot)) return slot;
  return null;
}

/** A level starts (or co-op ends) with nobody's menu open. */
export function resetPause(): void {
  pausedSeats.clear();
}
