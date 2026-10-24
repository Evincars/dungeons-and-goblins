/**
 * Browsers keep a page silent until the player first clicks, taps or presses a key. Sound started before then is
 * refused, and Howler's own unlock on that first gesture reloads every HTML5 audio element that has not played yet,
 * cutting off music that had only just been started. So the game starts no sound until that first gesture has been
 * handled: what is asked for earlier waits for it here.
 */

/** The gestures Howler unlocks on (not pointerdown: it comes before the click, and so before Howler's unlock). */
const GESTURES = ['click', 'keydown', 'touchend'] as const;

/** Tests run the game's modules under Node, which has no window to listen on. */
const hasWindow = typeof window !== 'undefined' && typeof window.addEventListener === 'function';

let unlocked = hasWindow && typeof navigator !== 'undefined' && navigator.userActivation?.hasBeenActive === true;
const waiting: Array<() => void> = [];

/** Whether the player has interacted with the page, so sound may play. */
export function audioUnlocked(): boolean {
  return unlocked;
}

/** Runs `action` now if sound may play, or right after the player's first gesture. */
export function whenAudioUnlocked(action: () => void): void {
  if (unlocked) action();
  else waiting.push(action);
}

/**
 * Runs `action` once, just after the next gesture has been handled — by then Howler's unlock (which listens on the
 * document) has run, and the page may still start sound (a gesture lets it for a few seconds).
 */
export function afterNextGesture(action: () => void): void {
  const once = () => {
    GESTURES.forEach((e) => window.removeEventListener(e, once, true));
    setTimeout(action, 0);
  };
  GESTURES.forEach((e) => window.addEventListener(e, once, true));
}

function unlock(): void {
  unlocked = true;
  for (const action of waiting.splice(0)) action();
}

if (hasWindow && !unlocked) afterNextGesture(unlock);
