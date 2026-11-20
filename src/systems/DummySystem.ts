import { world } from '../world';
import type { Entity } from '../world';

/**
 * The training dummy in the safe room: every hit lands (it flinches, shakes and shows hurt like an enemy),
 * but it never goes down. At rest it stands still; a blow plays one of its strips: a knock (4 frames) or a sway (5),
 * picked at random, or a heavy blow spins it round (8).
 */
const ROW_FRAMES = [4, 5, 8] as const;
/** `dummy.row` at rest: it stands still on the first frame of its first strip. */
export const DUMMY_STILL = -1;
const KNOCK_ROW = 0;
const SWAY_ROW = 1;
const SPIN_ROW = 2;
/** A blow taking at least this much of its health away (before it heals) spins it. */
const HEAVY_HIT = 15;

const dummies = world.with('dummy', 'health');
const animated = world.with('dummy', 'animation');

/** Simulation: the dummy is whole again before anything can finish it off. */
export function updateDummies(): void {
  for (const dummy of dummies) {
    const lost = dummy.health.max - dummy.health.current;
    if (lost > 0) dummy.dummy.row = lost >= HEAVY_HIT ? SPIN_ROW : Math.random() < 0.5 ? KNOCK_ROW : SWAY_ROW;
    dummy.health.current = dummy.health.max;
  }
}

/** Plays a strip once from its start, or (DUMMY_STILL) stands still on the first frame. */
function play(entity: Entity & { animation: NonNullable<Entity['animation']> }, row: number): void {
  const anim = entity.animation;
  const still = row === DUMMY_STILL;
  anim.frameY = still ? KNOCK_ROW : row;
  anim.frameX = 0;
  anim.timer = 0;
  anim.frameCount = still ? 1 : ROW_FRAMES[row] ?? 1;
  anim.loop = still;
}

/** Presentation: plays the strip of the blow it took, then stands still again (on every screen, from the synced row). */
export function animateDummies(): void {
  for (const dummy of animated) {
    const anim = dummy.animation;
    const playing = anim.frameCount > 1;
    if (dummy.dummy.row !== DUMMY_STILL && (!playing || anim.frameY !== dummy.dummy.row)) play(dummy, dummy.dummy.row);
    const finished = !anim.loop && anim.frameX >= anim.frameCount - 1 && anim.timer >= anim.frameTime - 1;
    if (!finished) continue;
    dummy.dummy.row = DUMMY_STILL;
    play(dummy, DUMMY_STILL);
  }
}
