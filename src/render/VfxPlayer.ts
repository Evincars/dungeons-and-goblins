import type { VfxEffectId } from './Vfx';

/**
 * One-shot particle effects (a spell's flames): asked for by the game where they go off, played on this screen by
 * systems/VfxSystem.ts, and — through the `onPlay` hook the co-op host installs (network/CoopGame.ts) — sent to every guest as
 * a short signal (which effect, where, which way), so each screen renders it itself. The loops (torches, campfires) need no
 * signal: they are part of the level every screen builds.
 */

/**
 * A one-shot to play: which effect, the feet of whatever it plays at (px, its depth among the entities), how far above them
 * it goes off (the caster's hands) and the unit vector it faces (its +x turned that way).
 */
export type VfxShot = { effect: VfxEffectId; x: number; y: number; lift: number; dirX: number; dirY: number };

/** No more than this many wait for the screen to play them (nothing plays them in a test, or while the level is frozen). */
const MAX_QUEUED = 32;
const queued: VfxShot[] = [];

/** Observer: the co-op host relays every one-shot played here to its guests (whoever installs it clears it). */
export const vfxEvents: { onPlay: ((shot: VfxShot) => void) | null } = { onPlay: null };

/** Plays a one-shot on this screen only (a guest, told of it by the host). */
export function playVfxLocal(shot: VfxShot): void {
  if (queued.length >= MAX_QUEUED) queued.shift();
  queued.push(shot);
}

/** Plays a one-shot effect `lift` px above (x, y), facing (dirX, dirY), here and on every guest's screen. */
export function playVfx(effect: VfxEffectId, x: number, y: number, lift = 0, dirX = 1, dirY = 0): void {
  const shot: VfxShot = { effect, x, y, lift, dirX, dirY };
  vfxEvents.onPlay?.(shot);
  playVfxLocal(shot);
}

/** The one-shots asked for since the screen last played them, handed over once (the queue is emptied into `into`). */
export function takeQueuedVfx(into: VfxShot[]): VfxShot[] {
  into.length = 0;
  for (const shot of queued) into.push(shot);
  queued.length = 0;
  return into;
}
