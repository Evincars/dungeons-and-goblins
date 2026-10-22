import { world } from '../world';
import type { Entity } from '../world';

/**
 * The training dummy in the safe room: every hit lands (it flinches, shakes and shows hurt like an enemy),
 * but it never goes down. Its strips: idle (4 frames), a hit (5) and a heavy hit (8).
 */
const ROW_FRAMES = [4, 5, 8] as const;
const IDLE_ROW = 0;
const HIT_ROW = 1;
const HEAVY_HIT_ROW = 2;
/** A blow taking at least this much of its health away (before it heals) plays the heavy hit. */
const HEAVY_HIT = 15;

const dummies = world.with('dummy', 'health');
const animated = world.with('dummy', 'animation');

/** Simulation: the dummy is whole again before anything can finish it off. */
export function updateDummies(): void {
  for (const dummy of dummies) {
    const lost = dummy.health.max - dummy.health.current;
    if (lost > 0) dummy.dummy.row = lost >= HEAVY_HIT ? HEAVY_HIT_ROW : HIT_ROW;
    dummy.health.current = dummy.health.max;
  }
}

function play(entity: Entity & { animation: NonNullable<Entity['animation']> }, row: number): void {
  const anim = entity.animation;
  anim.frameY = row;
  anim.frameX = 0;
  anim.timer = 0;
  anim.frameCount = ROW_FRAMES[row] ?? ROW_FRAMES[IDLE_ROW];
  anim.loop = row === IDLE_ROW;
}

/** Presentation: plays the hit strip it took, then goes back to idling (on every screen, from the synced row). */
export function animateDummies(): void {
  for (const dummy of animated) {
    const anim = dummy.animation;
    if (dummy.dummy.row !== IDLE_ROW && anim.frameY !== dummy.dummy.row) play(dummy, dummy.dummy.row);
    const finished = !anim.loop && anim.frameX >= anim.frameCount - 1 && anim.timer >= anim.frameTime - 1;
    if (!finished) continue;
    dummy.dummy.row = IDLE_ROW;
    play(dummy, IDLE_ROW);
  }
}
